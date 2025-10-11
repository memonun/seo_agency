# Prompt Management System - Implementation Specification

## Overview
Implement a prompt management system for content ideation. Users create and manage two types of prompts:
- **User Prompts**: Company context and business information (reusable across projects)
- **Purpose Prompts**: Campaign-specific research intent (project-specific)

**Important**: These prompts are used during content idea generation (NOT keyword research) to provide AI with better context.

---

## Database Structure (Already Created)

### `user_prompts` table
- `id` (UUID, primary key)
- `user_id` (UUID, references auth.users)
- `title` (VARCHAR(100), not null)
- `prompt_text` (TEXT, not null)
- `extracted_parameters` (JSONB, nullable)
- `extraction_status` (VARCHAR(20), default 'pending')
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)
- `is_active` (BOOLEAN, default true)

### `purpose_prompts` table
- Same structure as `user_prompts`

### `search_sessions` table (updated)
- Existing columns...
- `user_prompt_id` (UUID, nullable, references user_prompts.id)
- `purpose_prompt_id` (UUID, nullable, references purpose_prompts.id)
- `combined_context` (JSONB, nullable)

---

## File Structure

```
src/
├── pages/
│   └── Prompts.jsx
├── components/
│   ├── prompts/
│   │   ├── PromptCard.jsx
│   │   ├── PromptModal.jsx
│   │   ├── PromptSelector.jsx
│   │   ├── PromptPreview.jsx
│   │   └── EmptyPromptState.jsx
├── hooks/
│   └── usePrompts.js
└── utils/
    └── promptHelpers.js
```

---

## 1. Navigation & Routing

### Add Route
- Path: `/prompts`
- Component: `Prompts` page

### Update Navigation
- Add link to prompts page in main navigation
- Label: "My Prompts" or "Prompt Management"

---

## 2. Prompts Page (`Prompts.jsx`)

### Layout Structure

**Two-Tab Interface:**
- Tab 1: "User Prompts (Company Context)" - Blue theme
- Tab 2: "Purpose Prompts (Research Intent)" - Green theme

**Header:**
- Page title: "My Prompts"
- Subtitle explaining enhancement of AI content generation
- "Create New Prompt" button (top-right)
- Tab labels show count (e.g., "User Prompts (5)")

**Content Area:**
- Responsive grid of prompt cards
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: 1 column
- Empty state component when no prompts exist

### State Management

Track:
- Active tab ('user' or 'purpose')
- Modal open/closed
- Currently editing prompt (null if new)
- Arrays of user and purpose prompts
- Loading state
- Error message

### Data Fetching

On mount, fetch both prompt types:
```javascript
// Fetch active prompts, order by created_at DESC
// Filter: is_active = true, user_id = current user
```

### Actions

**Tab Switching:**
- Update active tab
- Display corresponding prompts
- Visual indicator on active tab

**Create New:**
- Open modal with empty form

**Edit:**
- Open modal with prompt data pre-filled

**Delete:**
- Show confirmation
- Soft delete: set `is_active = false`
- Refresh list

**Duplicate:**
- Create copy with " (Copy)" appended to title
- Set extraction_status to 'pending'
- Refresh list

---

## 3. Prompt Card (`PromptCard.jsx`)

### Display Elements

- Title (header)
- Status badge (pending/completed/failed) in corner
- Prompt text preview (first 150 chars + ellipsis)
- Creation date (relative: "2 days ago")
- Action buttons: Edit, Duplicate, Delete

### Visual Themes

**User Prompts:** Blue accent
**Purpose Prompts:** Green accent

Apply theme to card border/accent.

### Status Badges

- **Pending**: "Processing..."
- **Completed**: "Ready"
- **Failed**: "Failed"

### Interaction

**Hover:** Elevate card, show actions
**Mobile:** Always show action buttons

### Props
- `prompt` (object)
- `promptType` ('user' | 'purpose')
- `onEdit`, `onDelete`, `onDuplicate` callbacks

---

## 4. Prompt Modal (`PromptModal.jsx`)

### Structure

**Header:**
- Title: "Create/Edit Prompt"
- Close button

**Body (Form):**
- Prompt type selector (radio buttons)
- Title input
- Prompt text textarea
- Help/tips section

**Footer:**
- Cancel button
- Save button (with loading state)

### Form Fields

**1. Prompt Type Selector (Radio)**
- User Prompt vs Purpose Prompt
- Disabled when editing

**2. Title Field**
- Max 100 characters
- Required
- Character counter
- Placeholder: "e.g., My Company Profile, Q4 Campaign Context"

**3. Prompt Text Field**
- Textarea, max 2000 characters
- Required (min 50 characters)
- Character counter
- Dynamic placeholder based on type

### Placeholders

**User Prompt Example:**
"We are a B2B SaaS company in the project management space, targeting mid-sized tech companies (50-500 employees). Our content should be professional yet approachable, focusing on productivity and team collaboration. We compete with Asana and Monday.com."

**Purpose Prompt Example:**
"This research is for our Q4 content campaign focused on remote team management. We want to create blog posts and video content addressing distributed team challenges. Target: team leads and project managers at tech companies."

### Help Sections

**User Prompts Tips:**
- Describe industry and company type
- Mention target audience
- Include brand voice preferences
- List competitors if relevant
- Note geographic markets

**Purpose Prompts Tips:**
- Explain campaign/project goal
- Specify content formats needed
- Describe target audience for this project
- Mention tone requirements
- Include constraints or deadlines

### Validation

**Title:**
- Required
- Min 3 characters
- Max 100 characters

**Prompt Text:**
- Required
- Min 50 characters (AI needs context)
- Max 2000 characters

Display errors inline below fields.

### Save Flow

1. Validate form
2. Show loading state
3. Get current user ID
4. Prepare data:
   - user_id
   - title (trimmed)
   - prompt_text (trimmed)
   - extraction_status: 'pending'
   - is_active: true

5. If editing: UPDATE by ID
6. If creating: INSERT new
7. Handle success/error
8. Refresh parent, close modal

---

## 5. Prompt Selector (`PromptSelector.jsx`)

### Integration Point

**CRITICAL**: Place this component where users trigger "Generate Content Ideas" (AFTER keyword research).

This could be:
- On search results page
- In a modal before content generation
- As a step in content workflow

### Layout

**Section Header:**
- Title: "Add Context for Better AI Results"
- Subtitle: "Optional: Enhance with business context"

**Two Dropdowns:**

**User Prompt Dropdown:**
- Label: "Company Context (Optional)"
- Options:
  - "None (use default)"
  - All active user prompts (by title)
  - "+ Create New User Prompt"

**Purpose Prompt Dropdown:**
- Label: "Research Purpose (Optional)"
- Options:
  - "None (general research)"
  - All active purpose prompts (by title)
  - "+ Create New Purpose Prompt"

### Preview Display

When prompt selected:
- Show `PromptPreview` below dropdown
- Display title, text preview, date, status

### Create New Flow

When "+ Create New" selected:
- Open `PromptModal`
- Pre-set correct prompt type
- After creation:
  - Refresh dropdowns
  - Auto-select new prompt

### Data

On mount:
- Fetch all active user prompts
- Fetch all active purpose prompts
- Populate dropdowns

Optional: Only show prompts with extraction_status = 'completed'

### Props

- `selectedUserPromptId`
- `selectedPurposePromptId`
- `onUserPromptChange` callback
- `onPurposePromptChange` callback

### Responsive

- Desktop: Dropdowns side-by-side
- Mobile: Stacked vertically

---

## 6. Integration with Content Ideation

### Where to Place Selector

Identify where users click "Generate Content Ideas" and place `PromptSelector` BEFORE that triggers.

### Parent Component State

Track:
- Selected user prompt ID (null default)
- Selected purpose prompt ID (null default)

### Update Search Session

When generating content ideas:

1. Update search_sessions record:
```javascript
UPDATE search_sessions
SET user_prompt_id = ?, purpose_prompt_id = ?
WHERE id = searchSessionId
```

2. Trigger content ideation workflow (n8n webhook)

Backend will:
- Fetch search session
- See prompt IDs
- Fetch prompt data
- Use context for AI generation

---

## 7. Prompt Preview (`PromptPreview.jsx`)

Small card showing:
- Title (bold)
- Truncated text (200 chars)
- Creation date
- Status badge

Subtle background matching prompt type theme.

**Props:**
- `prompt` (object)

---

## 8. Empty State (`EmptyPromptState.jsx`)

Displayed when no prompts exist for active tab.

**Content:**
- Large icon (company/target based on type)
- Headline: "No [Type] Prompts Yet"
- Description (2-3 sentences about benefits)
- CTA button: "Create Your First Prompt"

**Different Messages:**
- User: Explain company context helps align with brand
- Purpose: Explain campaign context focuses content ideas

**Optional:**
Show 2-3 sample templates user can click to pre-fill.

**Props:**
- `promptType` ('user' | 'purpose')
- `onCreate` callback

---

## 9. usePrompts Hook

### Return Values

```javascript
{
  userPrompts: [],
  purposePrompts: [],
  loading: boolean,
  error: string | null,
  fetchPrompts: () => {},
  createPrompt: (type, data) => {},
  updatePrompt: (type, id, data) => {},
  deletePrompt: (type, id) => {},
  duplicatePrompt: (type, prompt) => {},
  getPromptById: (type, id) => {}
}
```

### Functions

**fetchPrompts:**
```javascript
// Query both tables WHERE is_active = true
// Filter by current user
// Order by created_at DESC
```

**createPrompt(promptType, promptData):**
```javascript
// Get user ID
// INSERT into correct table
// Refresh prompts
// Return {success, error}
```

**updatePrompt(promptType, id, data):**
```javascript
// UPDATE correct table WHERE id
// Set extraction_status = 'pending'
// Update updated_at
// Refresh prompts
```

**deletePrompt(promptType, id):**
```javascript
// Soft delete: UPDATE is_active = false
// Refresh prompts
```

**duplicatePrompt(promptType, prompt):**
```javascript
// INSERT with same text
// Append " (Copy)" to title
// extraction_status = 'pending'
// Refresh prompts
```

**getPromptById(promptType, id):**
```javascript
// Search array, return match
```

---

## 10. Helper Utilities (`promptHelpers.js`)

### formatDate(dateString)
Convert to relative format:
- "Today", "Yesterday", "X days ago", or full date

### truncateText(text, maxLength = 150)
Return original or truncated + "..."

### getExtractionStatusBadge(status)
Return: `{text, color}` for pending/completed/failed

### validatePromptForm(formData)
Return validation errors object:
- title: required, 3-100 chars
- promptText: required, 50-2000 chars

### getPlaceholderText(promptType)
Return appropriate placeholder for user vs purpose

---

## Data Flow Summary

### Creating Prompts
1. User opens Prompts page
2. Clicks "Create New"
3. Fills form in modal
4. Saves to database (extraction_status='pending')
5. Backend asynchronously extracts parameters

### Using Prompts
1. User completes keyword research
2. Navigates to content idea generation
3. Sees PromptSelector
4. Selects optional prompts
5. Triggers content ideation
6. System updates search_sessions with prompt IDs
7. Backend uses prompt context for AI generation

### Managing Prompts
- Edit: Opens modal, saves changes
- Delete: Confirms, soft deletes
- Duplicate: Creates copy

---

## Styling Guidelines

### Themes
- **User Prompts**: Blue accents (#3B82F6 family)
- **Purpose Prompts**: Green accents (#10B981 family)

### Status Colors
- Pending: Yellow
- Completed: Green
- Failed: Red

### Cards
- White background
- Light border
- Border radius: 8-12px
- Shadow on hover
- Smooth transitions

### Responsive Grid
- Use CSS Grid
- Gap: 16-24px
- Auto-fit columns based on breakpoints

---

## User Feedback

### Toast Notifications
- Success: "Prompt created/updated/deleted"
- Error: "Failed to [action]. Please try again."
- Auto-dismiss after 3-5 seconds

### Confirmation
- Before delete: "Are you sure? This cannot be undone."

### Loading States
- Skeleton loaders while fetching
- Disabled buttons during save
- Spinner or "Saving..." text

### Validation
- Inline errors below fields
- Clear after fix
- Only show after interaction

---

## Supabase Query Patterns

### Fetch Prompts
```javascript
const { data, error } = await supabase
  .from('user_prompts')
  .select('*')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .order('created_at', { ascending: false })
```

### Insert
```javascript
const { data, error } = await supabase
  .from('user_prompts')
  .insert([{
    user_id,
    title,
    prompt_text,
    extraction_status: 'pending',
    is_active: true
  }])
```

### Update
```javascript
const { error } = await supabase
  .from('user_prompts')
  .update({
    title,
    prompt_text,
    extraction_status: 'pending',
    updated_at: new Date().toISOString()
  })
  .eq('id', promptId)
  .eq('user_id', user.id)
```

### Soft Delete
```javascript
const { error } = await supabase
  .from('user_prompts')
  .update({ is_active: false })
  .eq('id', promptId)
  .eq('user_id', user.id)
```

### Update Search Session
```javascript
const { error } = await supabase
  .from('search_sessions')
  .update({
    user_prompt_id,
    purpose_prompt_id
  })
  .eq('id', searchSessionId)
  .eq('user_id', user.id)
```

---

## User Isolation

**Important**: Always filter by `user_id` in queries to ensure data isolation:
```javascript
.eq('user_id', user.id)
```

Get current user:
```javascript
const { data: { user } } = await supabase.auth.getUser()
```

---

## Success Criteria

✅ Users can create both prompt types
✅ Tabs, cards, and modal work correctly
✅ Empty states display appropriately
✅ Prompt selector integrates with content flow
✅ Prompts associate with search sessions
✅ CRUD operations work
✅ Form validation prevents bad data
✅ Responsive on all screen sizes
✅ Loading/error states handled
✅ Smooth UX, no console errors

---

## Implementation Notes

- Use existing tech stack conventions (React, Vite, Supabase, React Router)
- Follow existing CSS/styling patterns in the project
- Wrap all Supabase calls in try-catch
- Filter by user_id for data isolation (no RLS policies)
- Backend handles parameter extraction asynchronously
- Frontend only displays extraction status, doesn't process parameters
- Keep component structure modular and reusable
