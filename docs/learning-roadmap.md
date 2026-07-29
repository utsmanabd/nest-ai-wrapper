# Spec: Learning Roadmap — nest-ai-wrapper

## Objective

Project ini adalah sandbox belajar cara kerja LLM (khususnya chatbot) dengan NestJS + Ollama + PostgreSQL.

**Sudah ada (baseline):**

- Chat non-streaming & streaming (SSE)
- Persistensi conversation + message di DB
- System prompt hardcode di runtime
- Model: Ollama (`qwen3.5:9b`)

**Tujuan roadmap:** menambah fitur secara bertahap agar tiap fase mengajarkan satu konsep LLM yang berbeda, tanpa merusak struktur codebase.

**Definisi sukses:**

- Setiap fase punya deliverable yang jelas dan bisa diuji sendiri
- Modul baru punya batas tanggung jawab yang jelas (tidak semua logic numpuk di `ChatService`)
- Kamu bisa jelaskan *mengapa* fitur itu ada, bukan cuma *cara* kerjanya

---



## Asumsi

1. Stack tetap NestJS + TypeORM + PostgreSQL + Ollama lokal
2. Fokus belajar backend/API dulu; UI opsional di luar scope roadmap ini
3. Satu fase selesai + dipahami sebelum lanjut fase berikutnya
4. Bahasa respons default: Bahasa Indonesia

→ Kalau asumsi ini salah, update dokumen ini dulu sebelum implementasi.

---



## Commands

```bash
npm install
npm run start:dev          # jalankan API
npm run build              # cek compile
npm test                   # unit test
npm run test:e2e           # e2e test
npm run lint               # lint
```

Ollama harus jalan di `http://localhost:11434`.

---



## Struktur target (evolusi bertahap)

Jangan buat semua folder di awal. Tambah modul **hanya saat fase membutuhkannya**.

```
src/
├── main.ts
├── app.module.ts
├── chat/                          # baseline — orchestration chat
│   ├── chat.controller.ts
│   ├── chat.service.ts
│   ├── chat.module.ts
│   ├── dto/
│   └── entities/
│       ├── conversation.entity.ts
│       └── message.entity.ts
├── llm/                           # Phase A+ — abstraksi ke Ollama
│   ├── llm.module.ts
│   ├── llm.service.ts             # call Ollama (chat, stream, count tokens)
│   └── dto/
├── context/                       # Phase A — truncation / windowing
│   ├── context.module.ts
│   ├── context.service.ts
│   └── strategies/
│       └── sliding-window.strategy.ts
├── prompt/                        # Phase B — system prompt & persona
│   ├── prompt.module.ts
│   ├── prompt.service.ts
│   └── personas/                  # optional: template persona
├── memory/                        # Phase C — summarization
│   ├── memory.module.ts
│   └── memory.service.ts
├── structured/                    # Phase D — JSON / schema output
│   ├── structured.module.ts
│   ├── structured.service.ts
│   └── schemas/
├── tools/                         # Phase E — tool calling
│   ├── tools.module.ts
│   ├── tools.registry.ts
│   ├── tools.service.ts
│   └── builtins/
│       ├── time.tool.ts
│       └── calculator.tool.ts
├── rag/                           # Phase F — retrieval
│   ├── rag.module.ts
│   ├── rag.service.ts
│   ├── chunking.service.ts
│   ├── embedding.service.ts
│   └── entities/
│       └── document-chunk.entity.ts
└── common/                        # shared types, constants, utils
    ├── constants.ts
    └── types/
```

**Aturan struktur:**

- `ChatService` = orchestrator (urutkan langkah: load history → build context → call LLM → save)
- Detail teknis LLM (HTTP ke Ollama, parse stream) hidup di `llm/`
- Jangan import `rag/` dari `tools/` atau sebaliknya tanpa alasan jelas
- Entity baru = folder `entities/` di modul pemiliknya

---



## Urutan fase


| Phase | Nama                             | Konsep LLM                  | Dependensi                   |
| ----- | -------------------------------- | --------------------------- | ---------------------------- |
| **A** | Context + token tracking         | Context window              | baseline                     |
| **B** | Configurable prompt + auto-title | Prompt engineering          | A (opsional tapi disarankan) |
| **C** | Conversation summarization       | Long-term memory            | A                            |
| **D** | Structured output                | LLM sebagai komponen sistem | A                            |
| **E** | Tool calling                     | Agent loop                  | D (JSON parsing membantu)    |
| **F** | RAG sederhana                    | Grounding / embeddings      | A, idealnya D                |


Fase **opsional pendukung** (boleh disisipkan kapan saja setelah A):

- Cancel mid-stream / partial save
- Guardrails (rate limit, filter dasar)

---



## Phase A — Context window management + token tracking



### Tujuan belajar

- Apa itu token vs karakter
- Kenapa full history tidak scalable
- Sliding window / truncation
- Observability: latency & token usage



### Yang harus dibuat

1. **Abstraksi LLM** (`src/llm/`)
  - Pindahkan call Ollama (non-stream + stream) dari `ChatService` ke `LlmService`
  - `ChatService` hanya orkestrasi
2. **Token / usage tracking**
  - Extend entity `Message` (atau buat entity `LlmUsage`):
    - `promptTokens` (nullable)
    - `completionTokens` (nullable)
    - `latencyMs` (nullable)
  - Ambil angka dari response Ollama bila tersedia; kalau tidak, estimasi kasar (mis. chars/4) dan tandai sebagai estimate
  - Return usage di response API chat (non-stream); untuk stream, kirim usage di event terakhir / setelah `done`
3. **Context builder** (`src/context/`)
  - Input: list messages + budget token (config, mis. `MAX_CONTEXT_TOKENS`)
  - Strategy awal: **sliding window**
    - Selalu keep system prompt
    - Keep N pesan terakhir yang muat di budget
  - Output: messages siap dikirim ke Ollama
  - Log / return metadata: `droppedMessageCount`, `estimatedTokens`
4. **Config**
  - Constant atau env: `MAX_CONTEXT_TOKENS`, `MODEL_NAME`, `OLLAMA_URL`
  - Jangan hardcode URL/model di tengah service (refactor dari baseline)



### Deliverable API (contoh)

- `POST /chat` response menambah field `usage` dan `context` (berapa pesan dipotong)
- Behavior chat tetap sama untuk conversation pendek



### Acceptance criteria

- [x] Conversation panjang (> budget) tidak mengirim semua history
- [x] System prompt tidak pernah terbuang oleh truncation
- [x] Usage/latency tercatat (DB dan/atau response)
- [x] Logic truncation ada di `context/`, bukan di `ChatService` secara inline besar-besaran
- [x] Unit test: sliding window keep system + pesan terbaru



### Out of scope Phase A

- Summarization (itu Phase C)
- Vector store / embeddings

---



## Phase B — Configurable system prompt + auto-title



### Tujuan belajar

- Pengaruh system prompt terhadap behavior
- Separasi role `system` / `user` / `assistant`
- Prompt injection awareness (dasar)



### Yang harus dibuat

1. **Prompt per conversation**
  - Tambah kolom di `Conversation`, mis. `systemPrompt` (text, nullable)
  - Kalau null → pakai default global
  - Endpoint update prompt: `PATCH /conversations/:id/prompt`
  - Saat build messages: pakai prompt conversation, bukan hardcode di service
2. **Persona presets (opsional tapi recommended)**
  - Beberapa template: `technical-assistant`, `code-tutor`, `concise-editor`
  - `POST /conversations` bisa terima `personaId` atau `systemPrompt`
3. **Auto-title**
  - Kolom `title` sudah ada — isi otomatis setelah pesan user pertama (atau setelah balasan pertama)
  - Call LLM kecil: “buat judul max 6 kata dari pesan ini”
  - Jangan block response chat utama: jalankan async / fire-and-forget dengan error handling
4. **List conversations**
  - `GET /conversations` → id, title, updatedAt
  - `GET /conversations/:id/messages` → history



### Acceptance criteria

- [x] Dua conversation bisa punya system prompt berbeda dan behavior-nya beda
- [x] Title terisi otomatis (tidak selalu `null`)
- [x] Default prompt tetap jalan kalau user tidak set custom
- [x] Prompt logic ada di `prompt/`, Chat hanya consume hasilnya



### Out of scope Phase B

- Multi-user auth
- UI settings page (cukup API)

---



## Phase C — Conversation summarization



### Tujuan belajar

- Memory yang lossy (summary ≠ transcript)
- Kapan meringkas (threshold)
- Kombinasi summary + recent messages



### Yang harus dibuat

1. **Schema**
  - Tambah di `Conversation`:
    - `summary` (text, nullable)
    - `summarizedUpToMessageId` atau `summarizedUntil` (pointer sampai mana sudah diringkas)
2. **Memory service** (`src/memory/`)
  - Trigger summarize bila:
    - jumlah pesan > threshold, **atau**
    - estimated tokens history > threshold
  - Prompt summarize: ringkas fakta penting, keputusan, preferensi user; buang base-base
  - Simpan summary; pesan lama boleh tetap di DB (jangan hapus dulu — lebih aman untuk belajar)
3. **Integrasi ke context builder**
  - Urutan context yang dikirim ke model:
  1. System prompt
  2. Summary (sebagai system atau user note khusus)
  3. Pesan terbaru yang belum masuk summary / sliding window
    ase A truncation tetap berlaku di atas hasil ini
4. **Endpoint manual (untuk eksperimen)**
  - `POST /conversations/:id/summarize` — paksa summarize sekarang



### Acceptance criteria

- [ ] Conversation sangat panjang tetap muat di context budget
- [ ] Summary muncul di DB dan dipakai di request berikutnya
- [ ] Transcript mentah masih bisa dibaca dari DB
- [ ] Ada cara reproduksi: chat panjang → summarize → tanya detail lama → bandingkan dengan/without summary



### Out of scope Phase C

- Hierarchical memory / multiple summary levels
- Hapus otomatis pesan lama

---



## Phase D — Structured output (JSON mode)



### Tujuan belajar

- LLM sebagai penghasil data terstruktur, bukan cuma chat
- Validasi schema + retry
- Parsing gagal adalah kasus normal yang harus di-handle



### Yang harus dibuat

1. **Structured service** (`src/structured/`)
  - Method generik: `generateJson<T>(messages, schemaDescription)` atau schema validator sederhana
  - Instruksi model: jawab **hanya** JSON valid
  - Validasi (bisa `class-validator` / zod / JSON Schema — pilih satu, konsisten)
  - Retry 1–2x kalau invalid, dengan error sebelumnya di-inject ke prompt
2. **Use case konkret di project** (pilih minimal 1)
  - **Follow-up suggestions:** setelah jawaban chat, generate `{ followUps: string[] }`
  - **Auto-title** (refactor Phase B agar pakai structured output)
  - **Chat metadata:** `{ answer, confidence, topics[] }`
3. **Endpoint eksperimen**
  - `POST /structured/extract` — body: text + schema name → JSON



### Acceptance criteria

- [ ] Response invalid JSON tidak merusak request utama (error ter-handle)
- [ ] Minimal 1 fitur produk memakai structured output
- [ ] Schema & parser tidak tersebar string mentah di controller



### Out of scope Phase D

- Full OpenAPI codegen dari schema
- Function calling lengkap (Phase E)

---



## Phase E — Tool calling (function calling)



### Tujuan belajar

- Agent loop: model → tool call → observation → model lagi
- Structured tool arguments
- Batas aman: tool whitelist, bukan akses bebas



### Yang harus dibuat

1. **Tool registry** (`src/tools/`)
  - Interface tool: `name`, `description`, `parametersSchema`, `execute(args)`
  - Builtin awal (cukup 2–3):
    - `get_current_time`
    - `calculator` (ekspresi matematika aman)
    - (opsional) `get_conversation_title` / search history sendiri
2. **Agent loop di orchestration**
  - Max steps (mis. 3–5) supaya tidak infinite loop
  - Alur:
  1. Kirim messages + tool definitions ke Ollama (cek support tools model)
  2. Kalau model minta tool → execute → append hasil sebagai role yang sesuai
  3. Ulang sampai text final atau max steps
    mpan ke DB: pesan assistant final; opsional simpan tool traces di tabel terpisah / metadata JSON
3. **API**
  - Flag di chat request: `enableTools?: boolean` (default false di awal biar aman)
  - Atau endpoint terpisah `POST /chat/agent` supaya belajarnya terisolasi
4. **Safety**
  - Hanya tool yang terdaftar di registry
  - Validasi args sebelum execute
  - Timeout per tool
  - Jangan expose tool yang bisa hapus data / shell arbitrary



### Acceptance criteria

- [ ] Pertanyaan “jam berapa sekarang?” memakai tool time (bukan mengarang)
- [ ] Calculator tool benar untuk ekspresi sederhana
- [ ] Max-steps menghentikan loop
- [ ] Tool yang tidak dikenal ditolak dengan aman



### Out of scope Phase E

- Multi-agent
- Browser automation / unrestricted code execution
- MCP client penuh (boleh jadi eksperimen terpisah nanti)

---



## Phase F — RAG sederhana



### Tujuan belajar

- Embeddings & similarity search
- Chunking
- Grounding: jawaban berbasis dokumen, bukan hafalan model
- Hallucination vs citation



### Yang harus dibuat

1. **Ingest**
  - Endpoint `POST /rag/documents` — upload text / path file markdown
  - Chunking service: split by heading / ukuran karakter (mulai sederhana)
  - Embedding via Ollama embedding model (atau model embed yang tersedia lokal)
  - Simpan chunk + embedding di PostgreSQL
    - Opsi belajar: kolom `vector` sebagai `float[]` / `jsonb` dulu
    - Upgrade opsional: `pgvector` kalau sudah nyaman
2. **Retrieve**
  - Query embed → top-k cosine similarity
  - Inject chunk relevan ke prompt (“Gunakan konteks berikut…”)
  - Minta model cantumkan sumber (chunk id / judul dokumen)
3. **Integrasi chat**
  - Flag `useRag?: boolean` atau otomatis bila ada dokumen di “knowledge base”
  - Context builder (Phase A) harus tetap respect budget: retrieved chunks ikut dihitung
4. **Modul terpisah** `src/rag/` — jangan campur entity dokumen ke dalam `chat/entities` tanpa batas jelas



### Acceptance criteria

- [ ] Tanya fakta yang hanya ada di dokumen yang di-ingest → jawaban mengutip konteks itu
- [ ] Tanya di luar dokumen → model boleh bilang “tidak ada di konteks”
- [ ] Chunking + retrieve punya test atau script demo yang reproducible
- [ ] Token budget tidak jebol karena terlalu banyak chunk



### Out of scope Phase F

- Hybrid search (BM25 + vector) tingkat lanjut
- Re-ranking model terpisah
- Multi-modal (PDF OCR, gambar) — boleh nanti

---



## Fase pendukung (opsional)



### Stream cancel + partial save

- Abort request Ollama saat client disconnect
- Simpan partial assistant message dengan flag `incomplete: true`
- Belajar: consistency streaming vs DB



### Guardrails dasar

- Rate limit per IP / per conversation
- Max message length
- Block list sederhana / deteksi attempt “ignore system prompt”
- Belajar: trust boundary user input vs system instruction

---



## Boundaries



### Always do

- Selesaikan acceptance criteria fase sebelum loncat
- Tambah modul baru sesuai struktur target; jangan gelembungkan `ChatService` tanpa batas
- Tulis catatan singkat di PR/commit: konsep LLM apa yang dipelajari
- Simpan secret (DB password, API key cloud nanti) di env, bukan di git



### Ask first

- Ganti model provider (OpenAI/Anthropic) menggantikan Ollama
- Tambah dependency besar (vector DB dedicated, queue, Redis)
- Hapus pesan/conversation otomatis dari DB
- Auth / multi-tenant



### Never do

- Campur Phase F (RAG) ke dalam `ChatService` sebelum `llm/` dan `context/` ada
- Tool yang menjalankan shell / SQL mentah dari output model tanpa sanitasi
- Commit `.env` berisi kredensial
- Refactor total seluruh app di satu PR “big bang”

---



## Checklist progress


| Phase                         | Status | Catatan |
| ----------------------------- | ------ | ------- |
| Baseline (chat + stream + DB) | ✅ Done |         |
| A — Context + token tracking  | ✅ Done | Sliding window + LlmService + usage columns |
| B — Prompt + auto-title       | ✅ Done | Personas + PATCH prompt + auto-title async |
| C — Summarization             | ⬜ Todo |         |
| D — Structured output         | ⬜ Todo |         |
| E — Tool calling              | ⬜ Todo |         |
| F — RAG                       | ⬜ Todo |         |
| Stream cancel (opsional)      | ⬜ Todo |         |
| Guardrails (opsional)         | ⬜ Todo |         |


Update kolom Status saat fase selesai (`✅ Done` / `🚧 In progress`).

---



## Cara pakai dokumen ini

1. Pilih fase (mulai dari **A**)
2. Implement hanya daftar “Yang harus dibuat” di fase itu
3. Centang acceptance criteria
4. Tulis 3–5 kalimat refleksi: *apa yang kamu pelajari tentang LLM*
5. Baru lanjut fase berikutnya

Kalau suatu saat struktur folder mulai berantakan, kembali ke bagian **Struktur target** dan pecah service yang terlalu gemuk sebelum menambah fitur baru.