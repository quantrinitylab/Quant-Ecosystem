package com.quant.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests verifying Virtual Gifts and Audio Room Stage data models and business rules.
 */
class VirtualGiftAndAudioRoomTest {

    @Test
    fun testVirtualGiftItemCreationAndCatalog() {
        val gift = VirtualGiftItem(
            id = "gift_car",
            name = "Sports Car",
            icon = "🏎️",
            coinCost = 500
        )
        assertEquals("gift_car", gift.id)
        assertEquals("Sports Car", gift.name)
        assertEquals("🏎️", gift.icon)
        assertEquals(500, gift.coinCost)

        // Verify standard catalog contains required gifts
        assertNotNull(DEFAULT_VIRTUAL_GIFTS.find { it.name == "Rose" && it.icon == "🌹" && it.coinCost == 1 })
        assertNotNull(DEFAULT_VIRTUAL_GIFTS.find { it.name == "Heart" && it.icon == "💖" && it.coinCost == 5 })
        assertNotNull(DEFAULT_VIRTUAL_GIFTS.find { it.name == "Diamond" && it.icon == "💎" && it.coinCost == 50 })
        assertNotNull(DEFAULT_VIRTUAL_GIFTS.find { it.name == "Rocket" && it.icon == "🚀" && it.coinCost == 100 })
        assertNotNull(DEFAULT_VIRTUAL_GIFTS.find { it.name == "Sports Car" && it.icon == "🏎️" && it.coinCost == 500 })
    }

    @Test
    fun testVirtualGiftAffordabilityAndDeduction() {
        var userCoinBalance = 1250
        val expensiveGift = VirtualGiftItem("gift_star", "Supernova", "🌟", 2500)
        val affordableGift = VirtualGiftItem("gift_rocket", "Rocket", "🚀", 100)

        // Affordability check
        assertFalse("User should not afford expensive gift", userCoinBalance >= expensiveGift.coinCost)
        assertTrue("User should afford affordable gift", userCoinBalance >= affordableGift.coinCost)

        // Deduction check
        userCoinBalance -= affordableGift.coinCost
        assertEquals(1150, userCoinBalance)
    }

    @Test
    fun testAudioParticipantModelAndStates() {
        val speaker = AudioParticipant(
            id = "part_1",
            name = "Astra Sovereign",
            role = "Host",
            isMuted = false,
            handRaised = false,
            isSpeaking = true
        )
        assertEquals("part_1", speaker.id)
        assertEquals("Astra Sovereign", speaker.name)
        assertEquals("Host", speaker.role)
        assertFalse(speaker.isMuted)
        assertFalse(speaker.handRaised)
        assertTrue(speaker.isSpeaking)

        val listener = AudioParticipant(
            id = "part_2",
            name = "Elena Rostova",
            role = "Listener",
            isMuted = true,
            handRaised = true,
            isSpeaking = false
        )
        assertTrue(listener.isMuted)
        assertTrue(listener.handRaised)
        assertFalse(listener.isSpeaking)
    }

    @Test
    fun testSampleSpeakersAndListenersIntegrity() {
        assertTrue(SAMPLE_STAGE_SPEAKERS.isNotEmpty())
        assertTrue(SAMPLE_STAGE_LISTENERS.isNotEmpty())

        val host = SAMPLE_STAGE_SPEAKERS.find { it.role == "Host" }
        assertNotNull("Stage must have at least one Host", host)

        val handRaisedSpeaker = SAMPLE_STAGE_SPEAKERS.find { it.handRaised }
        assertNotNull("Sample speakers should include hand-raised indicator", handRaisedSpeaker)
    }
}
