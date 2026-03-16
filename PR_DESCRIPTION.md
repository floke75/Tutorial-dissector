# Pull Request: Cloud Persistence & Custom Vocabularies

## 🎯 Motivation & Context
**The Problem:** Previously, the application relied on browser `IndexedDB` (via `idb-keyval`) for storing project data. This meant that projects were tied to a specific browser and device, making it impossible for users to access their analysis sessions across different machines. Additionally, the application relied on a hardcoded `glossary/elements.json` file for UI element vocabularies, which restricted users from easily adding or managing custom vocabularies for different software applications.

**The Solution:** 
1. **Cloud Persistence:** Integrate Firebase Authentication (Google Sign-In) and Firestore to securely store and sync user projects across devices.
2. **Custom Vocabularies:** Introduce a new UI and backend flow allowing users to upload, manage, and apply custom JSON vocabularies on a per-project basis.

---

## 🏗️ Architecture & Logic Changes

### 1. Firebase Integration (`firebase.ts`, `services/storage.ts`)
- **Authentication:** Added Google Sign-In via Firebase Auth. Only authenticated users can create, view, and manage projects.
- **Firestore Migration:** Replaced `idb-keyval` with Firestore. Projects are now stored in a `projects` collection, keyed by the user's UID.
- **Data Models:** Updated the `Project` and `ProjectSummary` interfaces to align with Firestore document structures.

### 2. Custom Vocabularies Management (`components/Dashboard.tsx`, `services/storage.ts`)
- **Dashboard UI:** Added a new "Custom Vocabularies" section to the Dashboard.
- **Upload Flow:** Users can upload `.json` files containing custom UI element definitions. These are validated and stored in a new `vocabularies` Firestore collection.
- **Deletion:** Added confirmation-based deletion for custom vocabularies to prevent accidental data loss.

### 3. Project Configuration (`components/InputPanel.tsx`, `components/AnalysisView.tsx`)
- **Vocabulary Selection:** Replaced the static text input for `glossaryPath` with a dynamic dropdown in the `InputPanel`. Users can now select either the default `glossary/elements.json` or any of their uploaded custom vocabularies.
- **State Threading:** Threaded the selected vocabulary content through the `AnalysisView` and into the backend job submission.

### 4. Backend Processing (`server/jobManager.ts`, `utils/extractionVocabulary.ts`)
- **Dynamic Vocabulary Injection:** Updated the `/api/start-job` endpoint to accept `vocabularyContent`.
- **Extraction Logic:** Modified `generateExtractionVocabulary` to prioritize the provided `vocabularyContent` over reading from the local filesystem. This allows the LLM to use the user's custom definitions during Phase A and Phase B extraction.

### 5. Specification Updates (`tutorial-dissector.allium.md`, `PLAN.md`, `PROGRESS.md`)
- **Allium Spec:** Added `UserProfile` and `Vocabulary` entities. Updated the `Project` entity to link to `UserProfile`. Added the `ProjectDashboard` surface.
- **Documentation:** Updated `PLAN.md` and `PROGRESS.md` to reflect the shift from `IndexedDB` to Firebase Firestore and the addition of the custom vocabulary feature.

---

## 🧪 Testing & Verification Guide for Reviewer

### Manual Verification Steps
1. **Authentication:** Open the app in an incognito window. Verify that you are prompted to sign in with Google before accessing the dashboard.
2. **Project Sync:** Create a project on one device/browser, then log in on another. Verify that the project appears and loads correctly.
3. **Vocabulary Upload:** Upload a valid JSON vocabulary file from the dashboard. Verify it appears in the "Custom Vocabularies" list.
4. **Vocabulary Application:** Open a project, select the newly uploaded vocabulary from the "Vocabulary Source" dropdown, and start an analysis. Verify in the backend logs that the custom vocabulary content is being passed to the LLM.
5. **Deletion:** Delete a project and a custom vocabulary. Verify they are removed from the UI and Firestore.
