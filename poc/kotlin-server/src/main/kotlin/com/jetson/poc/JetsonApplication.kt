package com.jetson.poc

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.boot.CommandLineRunner
import org.springframework.context.annotation.Bean
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import java.sql.ResultSet
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootApplication
@EnableScheduling
class JetsonApplication {
    @Bean fun schemaRunner(dataSource: javax.sql.DataSource) = CommandLineRunner {
        ResourceDatabasePopulator(ClassPathResource("schema.sql")).execute(dataSource)
    }
}
fun main(args: Array<String>) { runApplication<JetsonApplication>(*args) }

data class Message(val message_id:String,val conversation_id:String,val sender_id:String,val operation_key:String,val payload:String,val position:Long)
data class SendRequest(val operation_key:String,val payload:String)
data class Claimed(val id:Long,val messageId:String,val recipientId:String,val leaseToken:String,val attempts:Int)

class ConflictException: RuntimeException()
class NotMemberException: RuntimeException()
class InvalidRequestException: RuntimeException()

@Service
class MessageStore(private val jdbc:JdbcTemplate, manager:PlatformTransactionManager) {
    private val tx=TransactionTemplate(manager)
    private fun map(rs:ResultSet)=Message(rs.getString("message_id"),rs.getString("conversation_id"),rs.getString("sender_id"),rs.getString("operation_key"),rs.getString("payload"),rs.getLong("position"))

    fun send(sender:String,conversation:String,key:String,payload:String):Message {
        if(sender.isBlank()||conversation.isBlank()||key.isBlank()||payload.isBlank()) throw InvalidRequestException()
        return tx.execute {
            jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",{_,_->Unit}, "$sender:$key")
            val member=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=? AND account_id=?)",Boolean::class.javaObjectType,conversation,sender) ?: false
            if(!member) throw NotMemberException()
            val old=jdbc.query("SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position FROM messages WHERE sender_id=? AND operation_key=?", {rs,_->map(rs)},sender,key)
            if(old.isNotEmpty()) {
                val m=old.first()
                if(m.conversation_id!=conversation||m.payload!=payload) throw ConflictException()
                return@execute m
            }
            val position=jdbc.queryForObject("INSERT INTO conversation_counters(conversation_id,last_position) VALUES(?,1) ON CONFLICT(conversation_id) DO UPDATE SET last_position=conversation_counters.last_position+1 RETURNING last_position",Long::class.javaObjectType,conversation)!!
            val id=UUID.randomUUID().toString()
            jdbc.update("INSERT INTO messages(id,conversation_id,sender_id,operation_key,payload,position) VALUES(?,?,?,?,?,?)",id,conversation,sender,key,payload,position)
            val recipients=jdbc.queryForList("SELECT account_id FROM conversation_members WHERE conversation_id=? AND account_id<>? ORDER BY account_id",String::class.java,conversation,sender)
            if(recipients.size!=1) throw InvalidRequestException()
            jdbc.update("INSERT INTO delivery_outbox(message_id,recipient_id) VALUES(?,?)",id,recipients[0])
            Message(id,conversation,sender,key,payload,position)
        } ?: error("transaction returned no message")
    }

    fun history(account:String,conversation:String,after:Long,limit:Int=50):List<Message> {
        if(after<0||limit !in 1..100) throw InvalidRequestException()
        val member=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=? AND account_id=?)",Boolean::class.javaObjectType,conversation,account) ?: false
        if(!member) throw NotMemberException()
        return jdbc.query("SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position FROM messages WHERE conversation_id=? AND position>? ORDER BY position LIMIT ?",{rs,_->map(rs)},conversation,after,limit)
    }

    fun claim(limit:Int=20,leaseMs:Long=15000):List<Claimed> {
        val token=UUID.randomUUID().toString()
        return jdbc.query("""WITH candidates AS (
            SELECT id FROM delivery_outbox WHERE available_at<=now()
            AND (state IN ('pending','retry_wait') OR (state='processing' AND lease_until<now()))
            ORDER BY id FOR UPDATE SKIP LOCKED LIMIT ?)
            UPDATE delivery_outbox o SET state='processing',attempt_count=o.attempt_count+1,
            lease_until=now()+(? * interval '1 millisecond'),lease_token=?,last_error=NULL
            FROM candidates WHERE o.id=candidates.id
            RETURNING o.id,o.message_id,o.recipient_id,o.lease_token,o.attempt_count""",
            {rs,_->Claimed(rs.getLong("id"),rs.getString("message_id"),rs.getString("recipient_id"),rs.getString("lease_token"),rs.getInt("attempt_count"))},limit,leaseMs,token)
    }

    fun dispatch(item:Claimed) {
        tx.execute {
            jdbc.update("""INSERT INTO recipient_inbox(message_id,recipient_id,conversation_id,position)
                SELECT id,?,conversation_id,position FROM messages WHERE id=?
                ON CONFLICT(message_id,recipient_id) DO NOTHING""",item.recipientId,item.messageId)
            val count=jdbc.update("""UPDATE delivery_outbox SET state='completed',completed_at=now(),lease_until=NULL,lease_token=NULL
                WHERE id=? AND state='processing' AND lease_token=? AND lease_until>clock_timestamp()""",item.id,item.leaseToken)
            if(count!=1) error("outbox lease lost")
        }
    }

    fun retry(item:Claimed,error:Throwable) {
        val terminal=item.attempts>=8
        val delay=if(terminal) 0L else minOf(1L shl item.attempts,256L)*1000
        val count=jdbc.update("""UPDATE delivery_outbox SET state=?,available_at=now()+(? * interval '1 millisecond'),
            lease_until=NULL,lease_token=NULL,last_error=? WHERE id=? AND state='processing' AND lease_token=? AND lease_until>clock_timestamp()""",
            if(terminal)"terminal_failure" else "retry_wait",delay,error.message.orEmpty().take(500),item.id,item.leaseToken)
        if(count!=1) error("outbox lease lost while retrying")
    }

    fun inbox(account:String,conversation:String,after:Long):List<Message> {
        val member=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=? AND account_id=?)",Boolean::class.javaObjectType,conversation,account) ?: false
        if(!member) throw NotMemberException()
        return jdbc.query("""SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.operation_key,m.payload,m.position
            FROM recipient_inbox i JOIN messages m ON m.id=i.message_id
            WHERE i.recipient_id=? AND i.conversation_id=? AND i.position>? ORDER BY i.position LIMIT 50""",
            {rs,_->map(rs)},account,conversation,after)
    }

    fun acknowledge(account:String,message:String) {
        val count=jdbc.update("""INSERT INTO delivery_receipts(message_id,recipient_id)
            SELECT message_id,recipient_id FROM recipient_inbox WHERE message_id=? AND recipient_id=?
            ON CONFLICT(message_id,recipient_id) DO NOTHING""",message,account)
        if(count==0) {
            val exists=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM delivery_receipts WHERE message_id=? AND recipient_id=?)",Boolean::class.javaObjectType,message,account)?:false
            if(!exists) throw NotMemberException()
        }
    }
}

@Service
@ConditionalOnProperty(name=["jet.worker.enabled"], havingValue="true", matchIfMissing=true)
class OutboxScheduler(private val store:MessageStore) {
    @Scheduled(fixedDelay=250)
    fun poll() {
        try { store.claim().forEach { item -> try { store.dispatch(item) } catch(e:Exception) { store.retry(item,e) } } }
        catch(_:Exception) { /* transient DB failure; next poll retries */ }
    }
}

@RestController
class MessageController(private val store:MessageStore) {
    private val mapper=ObjectMapper()
    @GetMapping("/healthz") fun health():ResponseEntity<Void> = ResponseEntity.noContent().build()
    @PostMapping("/v1/conversations/{conversation}/messages")
    fun send(@RequestHeader("X-Test-Account") account:String,@PathVariable conversation:String,@RequestBody request:SendRequest):ResponseEntity<Message> =
        ResponseEntity.accepted().body(store.send(account,conversation,request.operation_key,request.payload))

    @GetMapping("/v1/conversations/{conversation}/messages")
    fun history(@RequestHeader("X-Test-Account") account:String,@PathVariable conversation:String,@RequestParam(defaultValue="0") after:Long):List<Message> =
        store.history(account,conversation,after)

    @GetMapping("/v1/conversations/{conversation}/events",produces=[MediaType.TEXT_EVENT_STREAM_VALUE])
    fun events(@RequestHeader("X-Test-Account") account:String,@PathVariable conversation:String,@RequestParam(defaultValue="0") after:Long,@RequestHeader(value="Last-Event-ID",required=false) lastEventId:String?):StreamingResponseBody {
        store.inbox(account,conversation,0)
        val resume=if(lastEventId.isNullOrBlank()) after else lastEventId.toLongOrNull() ?: throw InvalidRequestException()
        if(resume<0) throw InvalidRequestException()
        return StreamingResponseBody { output ->
            var cursor=resume
            while(!Thread.currentThread().isInterrupted) {
                val messages=store.inbox(account,conversation,cursor)
                for(message in messages) {
                    val json=mapper.writeValueAsString(message)
                    output.write("id: ${message.position}\nevent: message\ndata: $json\n\n".toByteArray())
                    output.flush(); cursor=message.position
                }
                if(messages.isEmpty()) { output.write(": keepalive\n\n".toByteArray()); output.flush() }
                Thread.sleep(750)
            }
        }
    }

    @PostMapping("/v1/messages/{message}/ack")
    fun acknowledge(@RequestHeader("X-Test-Account") account:String,@PathVariable message:String):ResponseEntity<Void> {
        store.acknowledge(account,message); return ResponseEntity.noContent().build()
    }
}

@RestControllerAdvice
class ErrorAdvice {
    @ExceptionHandler(ConflictException::class) fun conflict()=ResponseEntity.status(409).body(mapOf("error" to "operation key conflict"))
    @ExceptionHandler(NotMemberException::class) fun forbidden()=ResponseEntity.status(403).body(mapOf("error" to "not a conversation member"))
    @ExceptionHandler(InvalidRequestException::class) fun invalid()=ResponseEntity.badRequest().body(mapOf("error" to "invalid request"))
}
