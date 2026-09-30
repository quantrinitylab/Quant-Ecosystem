package com.quant.app.data

import androidx.compose.runtime.mutableStateListOf

/**
 * Singleton shared state store for locally created ecosystem items.
 * Holds runtime-only state for calendar events, drive files, git repos, contacts, and AI chats.
 */
object EcosystemStateStore {

    // ─── Data Models ──────────────────────────────────────────────────────
    data class CalendarEvent(
        val id: String = "evt_${System.currentTimeMillis()}",
        val title: String,
        val time: String,
        val attendees: List<String> = emptyList(),
        val hasMeetLink: Boolean = false
    )

    data class DriveFile(
        val id: String = "file_${System.currentTimeMillis()}",
        val name: String,
        val size: String,
        val type: String, // "file", "folder", "scan", "offline"
        val timestamp: Long = System.currentTimeMillis()
    )

    data class GitRepo(
        val id: String = "repo_${System.currentTimeMillis()}",
        val name: String,
        val description: String,
        val isPrivate: Boolean,
        val branch: String = "main"
    )

    data class AiChatMessage(
        val id: String = "msg_${System.currentTimeMillis()}",
        val sender: String, // "user" or persona name e.g. "Aura"
        val text: String,
        val timestamp: Long = System.currentTimeMillis()
    )

    data class ContactItem(
        val id: String = "contact_${System.currentTimeMillis()}",
        val name: String,
        val email: String,
        val phone: String? = null,
        val company: String? = null,
        val role: String? = null,
        val tag: String = "All",
        val isVip: Boolean = false,
        val isStarred: Boolean = false
    )

    // ─── State Lists ──────────────────────────────────────────────────────
    val eventsList = mutableStateListOf<CalendarEvent>()
    val driveFilesList = mutableStateListOf<DriveFile>()
    val reposList = mutableStateListOf<GitRepo>()
    val aiChatHistory = mutableStateListOf<AiChatMessage>()
    val contactsList = mutableStateListOf<ContactItem>(
        ContactItem(
            id = "c1",
            name = "Sundar Pichai",
            email = "sundar@google.com",
            phone = "+1 (650) 253-0000",
            company = "Google & Alphabet",
            role = "CEO",
            tag = "VIP",
            isVip = true,
            isStarred = true
        ),
        ContactItem(
            id = "c2",
            name = "Satya Nadella",
            email = "satya@microsoft.com",
            phone = "+1 (425) 882-8080",
            company = "Microsoft",
            role = "CEO",
            tag = "VIP",
            isVip = true,
            isStarred = true
        ),
        ContactItem(
            id = "c3",
            name = "Sam Altman",
            email = "sam@openai.com",
            phone = "+1 (415) 555-0199",
            company = "OpenAI",
            role = "CEO",
            tag = "VIP",
            isVip = true,
            isStarred = true
        ),
        ContactItem(
            id = "c4",
            name = "Astra Executive AI",
            email = "astra@quantrinity.in",
            phone = "+91 98765 43210",
            company = "Quant Trinity Lab",
            role = "Quant Tripartite Swarm Lead",
            tag = "Leadership",
            isVip = true,
            isStarred = true
        ),
        ContactItem(
            id = "c5",
            name = "Dev Sentinel",
            email = "dev-sentinel@quantmail.in",
            phone = "+1 (555) 234-5678",
            company = "Quant Sovereign Systems",
            role = "Lead QA & Security Engineer",
            tag = "Engineering",
            isVip = false,
            isStarred = false
        ),
        ContactItem(
            id = "c6",
            name = "Sarah Chen",
            email = "sarah@quantmail.in",
            phone = "+1 (415) 555-0188",
            company = "Quant Design Systems",
            role = "Principal Frontend Architect",
            tag = "Design",
            isVip = false,
            isStarred = false
        ),
        ContactItem(
            id = "c7",
            name = "Linus Torvalds",
            email = "linus@kernel.org",
            phone = "+1 (503) 555-0199",
            company = "Linux Foundation",
            role = "Chief Architect",
            tag = "Engineering",
            isVip = false,
            isStarred = true
        ),
        ContactItem(
            id = "c8",
            name = "Alex Rivera",
            email = "alex.rivera@quantmail.in",
            phone = "+1 (415) 555-0142",
            company = "Enterprise Cloud Inc",
            role = "VP Enterprise Infrastructure",
            tag = "Customers",
            isVip = false,
            isStarred = false
        )
    )

    // ─── Helper Methods ───────────────────────────────────────────────────
    fun addEvent(title: String, time: String, attendees: List<String> = emptyList(), hasMeetLink: Boolean = false) {
        eventsList.add(0, CalendarEvent(title = title, time = time, attendees = attendees, hasMeetLink = hasMeetLink))
    }

    fun addFile(name: String, size: String, type: String) {
        driveFilesList.add(0, DriveFile(name = name, size = size, type = type))
    }

    fun addRepo(name: String, description: String, isPrivate: Boolean) {
        reposList.add(0, GitRepo(name = name, description = description, isPrivate = isPrivate))
    }

    fun addChatMessage(sender: String, text: String) {
        aiChatHistory.add(AiChatMessage(sender = sender, text = text))
    }

    fun addContact(
        name: String,
        email: String,
        phone: String? = null,
        company: String? = null,
        role: String? = null,
        tag: String = "All",
        isVip: Boolean = false,
        isStarred: Boolean = false
    ) {
        contactsList.add(
            0,
            ContactItem(
                name = name,
                email = email,
                phone = phone,
                company = company,
                role = role,
                tag = tag,
                isVip = isVip,
                isStarred = isStarred
            )
        )
    }

    fun toggleStar(contactId: String) {
        val index = contactsList.indexOfFirst { it.id == contactId }
        if (index != -1) {
            val contact = contactsList[index]
            contactsList[index] = contact.copy(isStarred = !contact.isStarred)
        }
    }
}
