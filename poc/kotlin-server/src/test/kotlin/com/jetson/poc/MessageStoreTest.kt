package com.jetson.poc

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.util.concurrent.Executors

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE, properties=["jet.worker.enabled=false"])
class MessageStoreTest @Autowired constructor(private val store:MessageStore,private val jdbc:JdbcTemplate) {
    @BeforeEach fun reset() {
        jdbc.execute("TRUNCATE delivery_receipts,recipient_inbox,delivery_outbox,messages,conversation_counters,conversation_members,conversations CASCADE")
        jdbc.execute("INSERT INTO conversations(id) VALUES('room-a'),('room-b')")
        jdbc.execute("INSERT INTO conversation_members(conversation_id,account_id) VALUES('room-a','alice'),('room-a','bob'),('room-b','alice'),('room-b','carol')")
    }

    @Test fun idempotentSendAndOutbox() {
        val first=store.send("alice","room-a","op-1","hello")
        val second=store.send("alice","room-a","op-1","hello")
        assertEquals(first.message_id,second.message_id)
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM delivery_outbox",Int::class.java))
    }

    @Test fun operationKeyConflict() {
        store.send("alice","room-a","op-2","hello")
        assertThrows(ConflictException::class.java) { store.send("alice","room-a","op-2","changed") }
        assertThrows(ConflictException::class.java) { store.send("alice","room-b","op-2","hello") }
    }

    @Test fun concurrentRetryCreatesOneMessage() {
        val pool=Executors.newFixedThreadPool(12)
        try {
            val results=(1..12).map { pool.submit<Message> { store.send("alice","room-a","parallel","same") } }.map { it.get() }
            assertEquals(1,results.map { it.message_id }.toSet().size)
        } finally { pool.shutdownNow() }
    }

    @Test fun inboxAndAcknowledgementAreRecipientScoped() {
        val message=store.send("alice","room-a","delivery","payload")
        val claimed=store.claim()
        assertTrue(claimed.isNotEmpty())
        claimed.forEach { store.dispatch(it) }
        assertTrue(store.inbox("bob","room-a",0).any { it.message_id==message.message_id })
        store.acknowledge("bob",message.message_id)
        assertThrows(NotMemberException::class.java) { store.acknowledge("mallory",message.message_id) }
    }
}

    @Test fun expiredOutboxLeaseFencesStaleWorker() {
        store.send("alice","room-a","lease","fenced")
        val first=store.claim(1,1000).single()
        jdbc.update("UPDATE delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=?",first.id)
        val second=store.claim(1,1000).single()
        assertNotEquals(first.leaseToken,second.leaseToken)
        assertThrows(IllegalStateException::class.java) { store.dispatch(first) }
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM recipient_inbox",Int::class.java))
        store.dispatch(second)
    }
