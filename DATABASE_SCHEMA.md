# Supabase Database Schema

Complete database schema documentation for the SEO Agency Tool - Generated from actual database structure.

**Last Updated**: 2025-10-10
**Database**: Supabase PostgreSQL
**Total Tables**: 16

---

## Table Overview

| Table Name | Purpose | Key Columns |
|------------|---------|-------------|
| `search_sessions` | Keyword research session tracking | id, user_id, main_keyword, completed, content_ideas_completed |
| `domain_analytics_sessions` | Domain analysis session tracking | id, user_id, domain_pattern, filter_type |
| `users` | Public user profiles | id, user_name, email, role |
| `master_kw_variations` | All keyword variations combined | search_id, keyword, msv, search_intent, answer |
| `related_keywords` | Related keyword research data | search_id, keyword, msv, kw_difficulty |
| `keyword_suggestions` | Autocomplete-based suggestions | search_id, keyword, msv |
| `keyword_ideas` | Keyword idea variations | search_id, keyword, msv, competition |
| `people_also_ask` | PAA questions with answers | search_id, people_also_ask, paa_answer |
| `autocomplete` | Search autocomplete data | search_id, autocomplete |
| `subtopics` | Topic suggestions | search_id, subtopics |
| `serp_results` | Search engine results pages | search_id, domain, url, title, description |
| `categories` | Keyword categorization | search_id, keyword, category |
| `clusters` | Keyword clustering | search_id, cluster, keywords (array) |
| `content_opps_categories` | AI-generated content opportunities by category | search_id, keyword, category, title, description |
| `content_opps_clusters` | AI-generated content opportunities by cluster | search_id, cluster, type, title, description |
| `generated_images` | AI-generated images for content | user_id, source_table, storage_path, public_url |

---

## User Management

### `users`

Public user profile table that extends Supabase Auth users with additional metadata.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | User identifier (same as auth.users.id) |
| `user_name` | TEXT | | Display name/username |
| `email` | TEXT | | User email address |
| `role` | TEXT | | User role (e.g., "admin", "user") |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | Account creation time |

**Relationships:**
- Maps to `auth.users` via `id`
- Referenced by all user-specific tables via foreign keys

**Purpose:**
- Stores additional user profile information
- Extends Supabase Auth with custom fields
- Used for user display names and role-based access control

**Sample Data:**
```json
{
  "id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "user_name": "user1",
  "email": "user@example.com",
  "role": "user",
  "created_at": "2025-10-06T12:00:00+00:00"
}
```

---

## Session Management Tables

### `search_sessions`

Tracks keyword research sessions initiated by users.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Client-generated session identifier |
| `user_id` | UUID | FOREIGN KEY → auth.users | User who created the session |
| `main_keyword` | TEXT | NOT NULL | Primary keyword for research |
| `location` | TEXT | | Geographic location for search |
| `language` | TEXT | | Language code for search |
| `limit_value` | INTEGER | | Result limit requested |
| `completed` | BOOLEAN | DEFAULT false | Whether keyword research is complete |
| `content_ideas_completed` | BOOLEAN | DEFAULT false | Whether content ideas generation is complete |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | Session creation time |

**Relationships:**
- One-to-Many with all keyword research tables via `search_id`
- Belongs to `auth.users` via `user_id`

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id` - Fast lookup by user
- INDEX on `completed` - Filter completed/pending sessions
- INDEX on `created_at DESC` - Recent sessions first

**Sample Data:**
```json
{
  "id": "15cb0369-9760-4aee-94a1-4daf9b704017",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "crypto",
  "location": "Turkey",
  "language": "Turkish",
  "limit_value": 30,
  "created_at": "2025-10-07T12:23:38.068957+00:00",
  "completed": false,
  "content_ideas_completed": false
}
```

---

### `domain_analytics_sessions`

Tracks domain analysis sessions for expired/available domain research.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Client-generated session identifier |
| `user_id` | UUID | FOREIGN KEY → auth.users | User who created the session |
| `domain_pattern` | TEXT | | Domain search pattern (supports wildcards like %seo%) |
| `filter_type` | TEXT | | Filter: 'all', 'expiring', 'high_traffic', 'high_backlinks' |
| `limit_value` | INTEGER | | Maximum results to return |
| `results_count` | INTEGER | | Actual number of results found |
| `completed_at` | TIMESTAMP WITH TIME ZONE | | When analysis completed |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | Session creation time |

**Relationships:**
- Belongs to `auth.users` via `user_id`

**Usage Notes:**
- Currently not heavily used (empty table)
- Supports wildcard domain searches using %

---

## Keyword Research Tables

All keyword research tables include `user_id` for data isolation and `search_id` for session tracking.

### `master_kw_variations`

Comprehensive database of all keyword variations from all research types combined.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Auto-generated |
| `search_id` | UUID | FOREIGN KEY → search_sessions | Parent search session |
| `user_id` | UUID | FOREIGN KEY → auth.users | User who owns this data |
| `main_keyword` | TEXT | | Original search keyword |
| `type` | TEXT | | Keyword type/source (e.g., "Related", "Ideas") |
| `keyword` | TEXT | | The actual keyword variation |
| `msv` | INTEGER | NULLABLE | Monthly Search Volume |
| `search_intent` | TEXT | NULLABLE | Intent: informational, transactional, navigational, commercial |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty score (0-100) |
| `competition` | TEXT | NULLABLE | Competition level: LOW, MEDIUM, HIGH |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `answer` | TEXT | NULLABLE | Featured snippet or direct answer content |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | Record creation time |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `search_id`
- INDEX on `user_id`
- INDEX on `msv DESC` - Sort by search volume

**Sample Data:**
```json
{
  "id": "f1756325-9d18-4763-b6ec-c8553faeafb4",
  "search_id": "d0a24acf-b9f2-42fc-9b2f-f3ac087008c0",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "type": "Related",
  "keyword": null,
  "msv": null,
  "search_intent": null,
  "kw_difficulty": null,
  "competition": null,
  "cpc": null,
  "answer": null,
  "created_at": "2025-10-06T19:42:06.260447+00:00"
}
```

---

### `related_keywords`

Keywords semantically related to the main search term.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Typically "Related" |
| `keyword` | TEXT | NULLABLE | Related keyword |
| `msv` | INTEGER | NULLABLE | Monthly Search Volume |
| `search_intent` | TEXT | NULLABLE | Search intent |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty |
| `competition` | TEXT | NULLABLE | Competition level |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

---

### `keyword_suggestions`

Keywords from search engine autocomplete and suggestion APIs.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Typically "Suggested" |
| `keyword` | TEXT | NULLABLE | Suggested keyword |
| `msv` | INTEGER | NULLABLE | Monthly Search Volume |
| `search_intent` | TEXT | NULLABLE | Search intent |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty |
| `competition` | TEXT | NULLABLE | Competition level |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

---

### `keyword_ideas`

Generated keyword variations and ideas based on the main keyword.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Typically "Ideas" |
| `keyword` | TEXT | | Keyword idea |
| `msv` | INTEGER | NULLABLE | Monthly Search Volume |
| `search_intent` | TEXT | NULLABLE | Search intent |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty |
| `competition` | TEXT | NULLABLE | Competition level (e.g., "LOW") |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Sample Data:**
```json
{
  "id": "1bfec8a9-c6f2-4e22-a4dc-9a2f4af5f3e3",
  "search_id": "d0a24acf-b9f2-42fc-9b2f-f3ac087008c0",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "type": "Ideas",
  "keyword": "miracle mantra",
  "msv": 10,
  "search_intent": "commercial",
  "kw_difficulty": null,
  "competition": "LOW",
  "cpc": null,
  "created_at": "2025-10-06T19:42:24.79515+00:00"
}
```

---

### `people_also_ask`

"People Also Ask" questions from search engines with full answers.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Typically "PAA" |
| `people_also_ask` | TEXT | NULLABLE | The question |
| `msv` | INTEGER | NULLABLE | Search volume for the question |
| `search_intent` | TEXT | NULLABLE | Search intent |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty |
| `competition` | TEXT | NULLABLE | Competition level |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `paa_answer` | TEXT | NULLABLE | Full answer to the question |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

**Usage Notes:**
- Currently not populated (empty table)
- Schema ready for PAA data integration

---

### `autocomplete`

Search engine autocomplete suggestions.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Typically "Autocomplete" |
| `autocomplete` | TEXT | | Autocomplete suggestion |
| `msv` | INTEGER | NULLABLE | Monthly Search Volume |
| `search_intent` | TEXT | NULLABLE | Search intent |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty |
| `competition` | TEXT | NULLABLE | Competition level |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Sample Data:**
```json
{
  "id": "bf063499-94b1-4357-95e1-7a38750c39d4",
  "search_id": "d0a24acf-b9f2-42fc-9b2f-f3ac087008c0",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "type": "Autocomplete",
  "autocomplete": "miracle chain",
  "msv": null,
  "search_intent": null,
  "kw_difficulty": null,
  "competition": null,
  "cpc": null,
  "created_at": "2025-10-06T19:42:36.223649+00:00"
}
```

---

### `subtopics`

Topical suggestions and content angles related to the main keyword.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Typically "Subtopics" |
| `subtopics` | TEXT | | Subtopic suggestion |
| `msv` | INTEGER | NULLABLE | Monthly Search Volume |
| `search_intent` | TEXT | NULLABLE | Search intent |
| `kw_difficulty` | FLOAT | NULLABLE | Keyword difficulty |
| `competition` | TEXT | NULLABLE | Competition level |
| `cpc` | TEXT | NULLABLE | Cost per click |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Sample Data:**
```json
{
  "id": "8d67bc90-386d-476e-91fa-363eb6842033",
  "search_id": "d0a24acf-b9f2-42fc-9b2f-f3ac087008c0",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "type": "Subtopics",
  "subtopics": "Definition of Miracle Chain",
  "msv": null,
  "search_intent": null,
  "kw_difficulty": null,
  "competition": null,
  "cpc": null,
  "created_at": "2025-10-06T19:42:47.294998+00:00"
}
```

---

## SERP & Analysis Tables

### `serp_results`

Search Engine Results Page data including competitor analysis.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | |
| `type` | TEXT | | Result type (e.g., "organic") |
| `domain` | TEXT | | Domain name (e.g., "www.youtube.com") |
| `url` | TEXT | | Full URL of the result |
| `title` | TEXT | | Page title |
| `description` | TEXT | | Meta description or snippet |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

**Special Use Cases:**
- **YouTube video detection**: Filter by `domain = 'www.youtube.com'`
- Used for YouTube content analysis workflow
- Competitor domain analysis

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `search_id`
- INDEX on `user_id`
- INDEX on `domain` - Filter by specific domains

**Sample Data:**
```json
{
  "id": "e1fa6916-ae10-429a-a0b3-c36ca3d818a7",
  "search_id": "d0a24acf-b9f2-42fc-9b2f-f3ac087008c0",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "type": "organic",
  "domain": "miraclechain.net",
  "url": "https://miraclechain.net/",
  "title": "Miracle Chain - Earn as You Build the Future of Blockchain",
  "description": "A Complete Blockchain Ecosystem Empowering Businesses...",
  "created_at": "2025-10-06T19:43:01.132884+00:00"
}
```

---

### `categories`

Keyword categorization for content organization.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | Original search keyword |
| `keyword` | TEXT | | The categorized keyword |
| `category` | TEXT | | Category name/label (e.g., "Unknown") |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

**Sample Data:**
```json
{
  "id": "a8917117-7be4-4eb1-a63a-f7d79518c193",
  "search_id": "1cd46142-d5c8-4eff-a844-41dc58a03a99",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "keyword": "miracle chain",
  "category": "Unknown",
  "created_at": "2025-10-06T21:27:16.505882+00:00"
}
```

---

### `clusters`

Keyword clustering for topical content planning.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `main_keyword` | TEXT | | Original search keyword |
| `cluster` | TEXT | | Cluster name/identifier |
| `keywords` | TEXT | | PostgreSQL array of keywords in cluster (stored as text array) |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

**Data Format:**
- `keywords` is stored as a PostgreSQL text array: `{keyword1, keyword2, keyword3}`
- Can be accessed as JSON array in application code

**Sample Data:**
```json
{
  "id": "b4d170f9-894a-4f58-bfff-c99d1ce6e12d",
  "search_id": "1cd46142-d5c8-4eff-a844-41dc58a03a99",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "main_keyword": "miracle chain",
  "cluster": "Miracle Chain Concepts",
  "keywords": "{\"Definition of Miracle Chain\",\"Historical Background of Miracle Chains\",\"Cultural Significance of Miracle Chains\",\"Types of Miracle Chains\"}",
  "created_at": "2025-10-06T21:28:09.157459+00:00"
}
```

---

## Content Opportunity Tables

### `content_opps_categories` ⭐ NEW

AI-generated content opportunities with titles and descriptions for each keyword category.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `keyword` | TEXT | | Target keyword for content |
| `category` | TEXT | | Content category (e.g., "Emerging Topics") |
| `title` | TEXT | | AI-generated article title |
| `description` | TEXT | | AI-generated article description/summary |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`

**Purpose:**
- Generated via "Get Content Ideas" workflow
- Provides ready-to-use blog post titles and descriptions
- Links keywords to actionable content opportunities
- Categorizes content by topic type

**Sample Data:**
```json
{
  "id": "78b93d61-4c9c-4a43-9ae5-cb5af91d8a82",
  "search_id": "1cd46142-d5c8-4eff-a844-41dc58a03a99",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "keyword": "miracle mantra",
  "category": "Emerging Topics",
  "title": "Unlocking the Power of the Miracle Mantra: A Comprehensive Guide",
  "description": "Discover the profound impact of the miracle mantra, an emerging topic captivating spiritual enthusiasts worldwide. This article delves into how incorporating this powerful mantra into daily practices can transform your life. Unlock the secrets and benefits of the miracle mantra and begin your journey towards inner peace and spiritual enlightenment.",
  "created_at": "2025-10-06T21:27:39.627432+00:00"
}
```

---

### `content_opps_clusters` ⭐ NEW

AI-generated content opportunities organized by keyword clusters rather than individual keywords.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `search_id` | UUID | FOREIGN KEY → search_sessions | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `cluster` | TEXT | | Cluster name (matches clusters.cluster) |
| `type` | TEXT | | Content type or format |
| `title` | TEXT | | AI-generated content title for the cluster |
| `description` | TEXT | | AI-generated content description |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | |

**Relationships:**
- Belongs to `search_sessions` via `search_id`
- Belongs to `auth.users` via `user_id`
- Relates to `clusters` table via `cluster` field

**Purpose:**
- Generated via "Get Content Ideas" workflow
- Provides cluster-level content opportunities (vs keyword-level in content_opps_categories)
- Groups related content ideas by topical clusters
- Enables content strategy at the cluster/topic level

**Use Case:**
Instead of individual keyword articles, this table provides comprehensive content pieces that cover entire clusters of related keywords.

**Sample Data:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "search_id": "1cd46142-d5c8-4eff-a844-41dc58a03a99",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "cluster": "Miracle Chain Concepts",
  "type": "Comprehensive Guide",
  "title": "The Ultimate Guide to Miracle Chains: Everything You Need to Know",
  "description": "A comprehensive exploration of miracle chains covering definitions, historical background, cultural significance, types, and mechanisms. This guide serves as a complete resource for understanding miracle chains across different contexts and applications.",
  "created_at": "2025-10-06T21:28:30.123456+00:00"
}
```

---

### `generated_images` ⭐ NEW

AI-generated images for content opportunities, clusters, and categories.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `user_id` | UUID | FOREIGN KEY → auth.users | |
| `search_id` | UUID | FOREIGN KEY → search_sessions, NULLABLE | Optional link to search session |
| `source_table` | TEXT | | Source: 'content_opps_categories', 'content_opps_clusters', 'clusters', 'categories' |
| `user_prompt` | TEXT | | User's original image request/prompt |
| `ai_prompt` | TEXT | | AI-enhanced prompt (from OpenAI) |
| `storage_path` | TEXT | | Path in Supabase Storage bucket |
| `public_url` | TEXT | | Public URL to access the image |
| `generation_status` | TEXT | | Status: 'pending', 'generating', 'completed', 'failed' |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT now() | When generation was requested |
| `completed_at` | TIMESTAMP WITH TIME ZONE | NULLABLE | When generation completed |

**Relationships:**
- Belongs to `auth.users` via `user_id`
- Optionally belongs to `search_sessions` via `search_id`
- Links to various source tables via `source_table` field

**Purpose:**
- Store AI-generated images via Flux Pro AI
- Link images to specific content opportunities or clusters
- Track image generation status and history
- Provide traceability from image back to content source

**Storage:**
- Images stored in Supabase Storage bucket: `generated-images`
- Organized by folder structure: `{user_id}/{source_table}/`

**Sample Data:**
```json
{
  "id": "img-12345-67890-abcde",
  "user_id": "0e1b08e4-ca1e-4009-9563-66d113b66658",
  "search_id": "1cd46142-d5c8-4eff-a844-41dc58a03a99",
  "source_table": "content_opps_categories",
  "user_prompt": "miracle mantra meditation",
  "ai_prompt": "A serene meditation scene featuring a person in lotus position, surrounded by glowing golden light forming sacred geometric patterns...",
  "storage_path": "0e1b08e4-ca1e-4009-9563-66d113b66658/content_opps_categories/miracle-mantra.png",
  "public_url": "https://jkoqttcselznnnuljfxf.supabase.co/storage/v1/object/public/generated-images/...",
  "generation_status": "completed",
  "created_at": "2025-10-08T14:30:00+00:00",
  "completed_at": "2025-10-08T14:31:45+00:00"
}
```

---

## Table Relationships (ERD)

```
auth.users ←→ users (1:1 profile extension)
    │
    ├── search_sessions (1:N)
    │   ├── master_kw_variations (1:N)
    │   ├── related_keywords (1:N)
    │   ├── keyword_suggestions (1:N)
    │   ├── keyword_ideas (1:N)
    │   ├── people_also_ask (1:N)
    │   ├── autocomplete (1:N)
    │   ├── subtopics (1:N)
    │   ├── serp_results (1:N)
    │   ├── categories (1:N)
    │   ├── clusters (1:N)
    │   ├── content_opps_categories (1:N)
    │   └── content_opps_clusters (1:N)  ⭐ NEW
    │
    ├── domain_analytics_sessions (1:N)
    │
    └── generated_images (1:N)  ⭐ NEW
        └── Links to content_opps_categories, content_opps_clusters, clusters, categories

All child tables also have direct foreign keys to auth.users via user_id
```

---

## Common Query Patterns

### Fetch All Research Data for a Session
```javascript
const searchId = '550e8400-e29b-41d4-a716-446655440000'

const [
  relatedKeywords,
  keywordSuggestions,
  keywordIdeas,
  autocomplete,
  peopleAlsoAsk,
  subtopics,
  serpResults,
  masterKwVariations,
  categories,
  clusters,
  contentOpps
] = await Promise.all([
  supabase.from('related_keywords').select('*').eq('search_id', searchId),
  supabase.from('keyword_suggestions').select('*').eq('search_id', searchId),
  supabase.from('keyword_ideas').select('*').eq('search_id', searchId),
  supabase.from('autocomplete').select('*').eq('search_id', searchId),
  supabase.from('people_also_ask').select('*').eq('search_id', searchId),
  supabase.from('subtopics').select('*').eq('search_id', searchId),
  supabase.from('serp_results').select('*').eq('search_id', searchId),
  supabase.from('master_kw_variations').select('*').eq('search_id', searchId),
  supabase.from('categories').select('*').eq('search_id', searchId),
  supabase.from('clusters').select('*').eq('search_id', searchId),
  supabase.from('content_opps_categories').select('*').eq('search_id', searchId),
  supabase.from('content_opps_clusters').select('*').eq('search_id', searchId)
])
```

### Get User's Search History
```javascript
const { data } = await supabase
  .from('search_sessions')
  .select('id, main_keyword, location, language, created_at, completed, content_ideas_completed')
  .eq('user_id', user.id)
  .eq('completed', true)
  .order('created_at', { ascending: false })
  .limit(10)
```

### Find YouTube Videos in SERP
```javascript
const { data } = await supabase
  .from('serp_results')
  .select('url, title, description')
  .eq('search_id', searchId)
  .eq('domain', 'www.youtube.com')
```

### Get Content Opportunities by Category
```javascript
const { data } = await supabase
  .from('content_opps_categories')
  .select('*')
  .eq('search_id', searchId)
  .eq('category', 'Emerging Topics')
  .order('created_at', { ascending: false })
```

### Get High-Volume Keywords
```javascript
const { data } = await supabase
  .from('master_kw_variations')
  .select('*')
  .eq('search_id', searchId)
  .not('msv', 'is', null)
  .gte('msv', 1000)
  .order('msv', { ascending: false })
```

### Get Keyword Clusters with Content Opportunities
```javascript
const { data: clusters } = await supabase
  .from('clusters')
  .select(`
    *,
    content_opps:content_opps_categories(*)
  `)
  .eq('search_id', searchId)
```

---

## Data Types Reference

### Common Data Types Used
- **UUID**: Universally Unique Identifier (128-bit)
- **TEXT**: Variable-length character string
- **INTEGER**: 4-byte integer
- **FLOAT**: Floating-point number
- **BOOLEAN**: True/false
- **TIMESTAMP WITH TIME ZONE**: Date and time with timezone
- **TEXT[]**: Array of text values (PostgreSQL array)

### Nullable Fields
Most metric fields (msv, kw_difficulty, competition, cpc, search_intent) are nullable because:
- Data may not be available from the API
- Certain keyword types don't have all metrics
- Allows for gradual data enrichment

---

## Database Naming Conventions

- **Tables**: Snake_case, plural nouns (e.g., `search_sessions`)
- **Columns**: Snake_case (e.g., `main_keyword`, `created_at`)
- **Primary Keys**: Always `id` (UUID type)
- **Foreign Keys**: `{entity}_id` format (e.g., `user_id`, `search_id`)
- **Timestamps**: `created_at`, `updated_at`, `completed_at` (all TIMESTAMP WITH TIME ZONE)
- **Boolean Flags**: Descriptive adjectives (e.g., `completed`, `content_ideas_completed`)
- **Join Tables**: `{table1}_{table2}` format (e.g., `content_opps_categories`)

---

## Security & Row Level Security (RLS)

### Recommended Policies

**All tables should have RLS enabled with user isolation:**

```sql
-- Example: search_sessions
CREATE POLICY "Users can view own search sessions"
ON search_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search sessions"
ON search_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Example: keyword tables (inherit from search session)
CREATE POLICY "Users can view own keyword data"
ON master_kw_variations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keyword data"
ON master_kw_variations FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**Key Security Principles:**
- Every table has `user_id` foreign key
- RLS policies enforce user data isolation
- No user can access another user's data
- Session-based authentication via Supabase Auth

---

## Data Retention & Cleanup Recommendations

### Keep Forever
- `search_sessions` - User history is valuable
- `content_opps_categories` - AI-generated content is costly to regenerate

### Archive After 1 Year
- All keyword research tables (can be regenerated if needed)
- `serp_results` (SERP data becomes stale)

### Delete After 7 Days
- Incomplete/failed sessions (`completed = false`)
- Sessions with no associated keyword data

### Soft Deletes
Consider implementing soft deletes (deleted_at timestamp) for:
- User-facing data (search_sessions)
- Content opportunities
- Any data that might need recovery

---

## Performance Optimization

### Recommended Indexes

```sql
-- Search sessions
CREATE INDEX idx_search_sessions_user_id ON search_sessions(user_id);
CREATE INDEX idx_search_sessions_completed ON search_sessions(completed);
CREATE INDEX idx_search_sessions_created_at ON search_sessions(created_at DESC);

-- All keyword tables (pattern)
CREATE INDEX idx_{table}_search_id ON {table}(search_id);
CREATE INDEX idx_{table}_user_id ON {table}(user_id);

-- Specific to high-volume queries
CREATE INDEX idx_master_kw_variations_msv ON master_kw_variations(msv DESC) WHERE msv IS NOT NULL;
CREATE INDEX idx_serp_results_domain ON serp_results(domain);

-- Content opportunities
CREATE INDEX idx_content_opps_category ON content_opps_categories(category);
```

### Query Optimization Tips
1. Always filter by `user_id` first (leverages RLS and indexes)
2. Use `search_id` for session-specific queries
3. Order by `created_at DESC` for recent data
4. Filter nullable fields with `WHERE field IS NOT NULL` before comparisons
5. Use EXPLAIN ANALYZE to optimize slow queries

---

## Migration Considerations

### If Adding New Tables
1. Include `id` (UUID PRIMARY KEY)
2. Include `user_id` (UUID FOREIGN KEY → auth.users)
3. Include `search_id` (UUID FOREIGN KEY → search_sessions) if session-related
4. Include `created_at` (TIMESTAMP WITH TIME ZONE DEFAULT now())
5. Set up RLS policies immediately

### If Modifying Existing Tables
1. Use migrations (not direct ALTER TABLE in production)
2. Test with sample data first
3. Consider data migration scripts for transformations
4. Update application code before schema changes go live

---

## Troubleshooting

### Common Issues

**Issue: "Row Level Security policy violation"**
- Solution: Check that `user_id` matches authenticated user
- Verify RLS policies are correctly configured

**Issue: "Keywords array not parsing correctly in clusters table"**
- Solution: The `keywords` field is a PostgreSQL text array
- Parse as: `JSON.parse(row.keywords)` or use PostgreSQL array functions

**Issue: "NULL values in msv, cpc, competition"**
- This is expected behavior - not all keywords have all metrics
- Always handle nullable fields in application code

**Issue: "Slow queries on large keyword datasets"**
- Add indexes on commonly filtered columns
- Use pagination with LIMIT/OFFSET
- Consider materialized views for analytics

---

## Future Schema Enhancements

### Potential Future Tables

**`content_calendar`** - Content planning and scheduling
- Links content opportunities to publication dates
- Track content status (draft, published, scheduled)

**`competitor_tracking`** - Monitor competitor keyword strategies
- Track competitor domains over time
- Alert on ranking changes

---

**Database Version**: PostgreSQL 15+ (Supabase)
**Schema Version**: 1.0.0
**Last Schema Query**: 2025-10-10
