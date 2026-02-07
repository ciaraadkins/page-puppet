# Page Puppet v2.0 - Collaborative Annotation & Version Management

## Project Overview
Extension of the Voice-Controlled DOM Manipulation Chrome Extension to support collaborative workflows where users can annotate elements with notes/feedback and create shareable instances of modified pages. Multiple users can access specific versions through URL parameters using anonymous authentication.

## New Core Features

### 1. Anonymous User System
- **No Login Required**: Users get auto-generated alphanumeric keys (e.g., "USER4B7X")
- **Customizable Keys**: Users can change their key to something memorable (if unique)
- **Display Names**: Optional friendly names while maintaining anonymity
- **Persistent Identity**: Keys stored locally, linked to Firebase anonymous auth

### 2. Element Annotation System
- **Note Creation**: Click any element to add contextual notes/feedback
- **Note Types**: Change requests, feedback, questions, approvals
- **Visual Indicators**: Annotated elements show subtle badges
- **Note Threads**: Reply to existing notes for discussion
- **Note Management**: View, edit, delete, and resolve notes

### 3. Package-Based Instance Creation
- **Change Packages**: All modifications and annotations grouped together
- **Automatic Snapshots**: Every annotation or voice command saves to current instance
- **Instance Metadata**: Timestamp, user, changes made, notes added
- **Shareable URLs**: Generate unique URLs like `example.com/page?puppet_instance=ABC123XYZ`
- **Instance History**: Browse through all versions of a page

### 4. Real-Time Collaboration
- **Multi-user Support**: Multiple people can view and edit same instance
- **Live Updates**: Notes and changes appear for all viewers in real-time
- **Collaborative Tracking**: See who made what changes and when
- **Anonymous Participation**: No accounts needed, just share the URL

## Technical Architecture

### Database Structure (Firebase Firestore)

#### Collection: users
```javascript
{
  // Document ID = userKey (e.g., "USER4B7X")
  userKey: "USER4B7X",
  firebaseUid: "anonymous_firebase_uid_12345",
  displayName: "Designer Sarah", // User customizable
  createdAt: "2025-09-20T14:30:00Z",
  lastActive: "2025-09-20T15:45:00Z",
  preferences: {
    defaultNoteType: "feedback",
    autoResolveOwnNotes: false
  },
  instancesCreated: ["ABC123XYZ", "DEF456GHI"],
  instancesCollaborated: ["ABC123XYZ", "JKL789MNO"]
}
```

#### Collection: instances
```javascript
{
  // Document ID = instanceId (e.g., "ABC123XYZ")
  instanceId: "ABC123XYZ",
  baseUrl: "https://example.com/page",
  urlHash: "sha256_hash_for_indexing",
  createdBy: "USER4B7X",
  createdAt: "2025-09-20T14:30:00Z",
  lastModified: "2025-09-20T15:45:00Z",
  title: "Homepage Redesign v1", // User-defined
  description: "Client feedback round 1",
  isPublic: true,
  
  // All changes grouped in one package
  changePackage: {
    domModifications: [
      {
        changeId: "CHG001",
        elementSelector: "#hero-button",
        elementContext: {
          tagName: "button",
          originalText: "Learn More",
          originalStyles: {...}
        },
        changeType: "voice_command",
        action: "changeColor",
        value: "red",
        appliedBy: "USER4B7X",
        timestamp: "2025-09-20T14:32:15Z"
      }
    ],
    annotations: [
      {
        annotationId: "ANN001",
        elementSelector: "#navigation",
        elementContext: {...},
        noteText: "This menu should be sticky when scrolling",
        noteType: "change_request",
        createdBy: "USER8K2M",
        createdAt: "2025-09-20T15:10:30Z",
        resolved: false,
        position: { x: 150, y: 200 },
        replies: [
          {
            replyId: "REP001",
            text: "Good idea, I'll implement that",
            createdBy: "USER4B7X",
            createdAt: "2025-09-20T15:25:00Z"
          }
        ]
      }
    ]
  },
  
  collaborators: [
    {
      userKey: "USER4B7X",
      displayName: "User 4B7X",
      firstJoined: "2025-09-20T14:30:00Z",
      lastActive: "2025-09-20T15:45:00Z",
      role: "creator"
    },
    {
      userKey: "USER8K2M",
      displayName: "Designer Sarah",
      firstJoined: "2025-09-20T15:08:00Z",
      lastActive: "2025-09-20T15:25:00Z",
      role: "collaborator"
    }
  ],
  
  collaboratorUids: ["firebase_uid_1", "firebase_uid_2"], // For security rules
  
  stats: {
    totalChanges: 15,
    totalAnnotations: 8,
    uniqueCollaborators: 3,
    viewCount: 27
  }
}
```

### Chrome Extension Architecture Updates

#### New Class: UserManager
```javascript
class UserManager {
  constructor() {
    this.currentUser = null;
    this.userKey = null;
    this.displayName = null;
  }

  async initializeUser() {
    try {
      // Firebase anonymous authentication
      const userCredential = await signInAnonymously(auth);
      this.currentUser = userCredential.user;
      
      // Generate or get user's custom key
      this.userKey = await this.getOrCreateUserKey();
      this.displayName = await this.getOrCreateDisplayName();
      
      return {
        firebaseUid: this.currentUser.uid,
        userKey: this.userKey,
        displayName: this.displayName
      };
    } catch (error) {
      console.error('Error initializing user:', error);
    }
  }

  async generateUniqueKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let attempts = 0;
    
    while (attempts < 10) {
      let key = 'USER';
      for (let i = 0; i < 4; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Check uniqueness in Firestore
      const userDoc = await getDoc(doc(db, 'users', key));
      if (!userDoc.exists()) {
        return key;
      }
      attempts++;
    }
    
    // Fallback to timestamp-based key
    return 'USER' + Date.now().toString(36).toUpperCase();
  }

  async updateUserKey(newKey) {
    // Allow user to customize their key if unique
    const userDoc = await getDoc(doc(db, 'users', newKey));
    if (!userDoc.exists()) {
      // Key is available
      await this.migrateUserData(this.userKey, newKey);
      localStorage.setItem('puppet_user_key', newKey);
      this.userKey = newKey;
      return true;
    }
    return false;
  }
}
```

#### New Class: AnnotationController
```javascript
class AnnotationController {
  constructor() {
    this.isAnnotationMode = false;
    this.selectedElement = null;
    this.annotations = [];
    this.annotationOverlays = [];
  }

  toggleAnnotationMode() {
    this.isAnnotationMode = !this.isAnnotationMode;
    
    if (this.isAnnotationMode) {
      this.activateAnnotationMode();
    } else {
      this.deactivateAnnotationMode();
    }
  }

  activateAnnotationMode() {
    document.addEventListener('click', this.handleElementClick.bind(this));
    this.showAnnotationModeIndicator();
    this.displayExistingAnnotations();
  }

  handleElementClick(event) {
    if (!this.isAnnotationMode) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const element = event.target;
    this.showAnnotationDialog(element, event.clientX, event.clientY);
  }

  showAnnotationDialog(element, x, y) {
    const dialog = document.createElement('div');
    dialog.className = 'puppet-annotation-dialog';
    dialog.style.cssText = `
      position: fixed;
      top: ${y + 10}px;
      left: ${x + 10}px;
      background: white;
      border: 2px solid #ff6b6b;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 1000000;
      min-width: 300px;
    `;
    
    dialog.innerHTML = `
      <div class="annotation-form">
        <textarea 
          placeholder="Add your note or feedback..." 
          class="note-text"
          rows="3"
          style="width: 100%; margin-bottom: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
        ></textarea>
        
        <select class="note-type" style="width: 100%; margin-bottom: 10px; padding: 8px;">
          <option value="change_request">Change Request</option>
          <option value="feedback">General Feedback</option>
          <option value="question">Question</option>
          <option value="approval">Approval</option>
        </select>
        
        <div class="button-group" style="display: flex; gap: 10px;">
          <button class="save-btn" style="flex: 1; padding: 8px; background: #ff6b6b; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Save Note
          </button>
          <button class="cancel-btn" style="flex: 1; padding: 8px; background: #ccc; color: black; border: none; border-radius: 4px; cursor: pointer;">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Handle save
    dialog.querySelector('.save-btn').addEventListener('click', () => {
      const noteText = dialog.querySelector('.note-text').value;
      const noteType = dialog.querySelector('.note-type').value;
      
      if (noteText.trim()) {
        this.createAnnotation(element, noteText, noteType, { x, y });
      }
      dialog.remove();
    });
    
    // Handle cancel
    dialog.querySelector('.cancel-btn').addEventListener('click', () => {
      dialog.remove();
    });
    
    // Focus textarea
    dialog.querySelector('.note-text').focus();
  }

  async createAnnotation(element, noteText, noteType, position) {
    const annotation = {
      annotationId: this.generateAnnotationId(),
      elementSelector: this.getElementSelector(element),
      elementContext: this.getElementContext(element),
      noteText: noteText,
      noteType: noteType,
      createdBy: userManager.userKey,
      createdAt: new Date().toISOString(),
      resolved: false,
      position: position,
      replies: []
    };
    
    // Add to current package
    changePackageManager.addAnnotation(annotation);
    
    // Display annotation overlay
    this.displayAnnotation(annotation);
    
    // Save to Firestore
    await this.saveAnnotationToFirestore(annotation);
  }

  displayAnnotation(annotation) {
    const overlay = document.createElement('div');
    overlay.className = 'puppet-annotation-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: ${annotation.position.y - 20}px;
      left: ${annotation.position.x - 20}px;
      width: 20px;
      height: 20px;
      background: ${this.getNoteTypeColor(annotation.noteType)};
      border: 2px solid white;
      border-radius: 50%;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    // Add note type indicator
    overlay.innerHTML = this.getNoteTypeIcon(annotation.noteType);
    
    // Click to view note
    overlay.addEventListener('click', () => {
      this.showAnnotationDetails(annotation);
    });
    
    document.body.appendChild(overlay);
    this.annotationOverlays.push(overlay);
  }

  getNoteTypeColor(noteType) {
    const colors = {
      'change_request': '#ff6b6b',
      'feedback': '#4ecdc4',
      'question': '#ffe66d',
      'approval': '#95e77e'
    };
    return colors[noteType] || '#999';
  }

  getNoteTypeIcon(noteType) {
    const icons = {
      'change_request': '✏️',
      'feedback': '💬',
      'question': '❓',
      'approval': '✅'
    };
    return icons[noteType] || '📝';
  }
}
```

#### Updated Class: ChangePackageManager
```javascript
class ChangePackageManager {
  constructor() {
    this.currentPackage = {
      domModifications: [],
      annotations: [],
      packageId: this.generatePackageId(),
      createdAt: new Date().toISOString()
    };
    this.currentInstanceId = null;
  }

  addVoiceCommand(element, command) {
    const change = {
      changeId: this.generateChangeId(),
      elementSelector: this.getElementSelector(element),
      elementContext: this.getElementContext(element),
      changeType: "voice_command",
      action: command.action,
      value: command.value,
      appliedBy: userManager.userKey,
      timestamp: new Date().toISOString()
    };
    
    this.currentPackage.domModifications.push(change);
    this.autoSaveToInstance();
  }

  addAnnotation(annotation) {
    this.currentPackage.annotations.push(annotation);
    this.autoSaveToInstance();
  }

  async savePackageAsNewInstance(title, description) {
    const instanceId = this.generateInstanceId();
    
    const instance = {
      instanceId: instanceId,
      baseUrl: window.location.href.split('?')[0],
      urlHash: this.hashUrl(window.location.href.split('?')[0]),
      createdBy: userManager.userKey,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      title: title || `Instance ${new Date().toLocaleDateString()}`,
      description: description || "",
      isPublic: true,
      changePackage: this.currentPackage,
      collaborators: [{
        userKey: userManager.userKey,
        displayName: userManager.displayName,
        firstJoined: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        role: "creator"
      }],
      collaboratorUids: [userManager.currentUser.uid],
      stats: {
        totalChanges: this.currentPackage.domModifications.length,
        totalAnnotations: this.currentPackage.annotations.length,
        uniqueCollaborators: 1,
        viewCount: 0
      }
    };

    await firebaseManager.saveInstance(instance);
    this.currentInstanceId = instanceId;
    
    // Update URL without reload
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('puppet_instance', instanceId);
    window.history.pushState({}, '', newUrl);
    
    return instanceId;
  }

  async loadInstancePackage(instanceId) {
    try {
      const instance = await firebaseManager.loadInstance(instanceId);
      
      // Apply all DOM modifications
      this.applyAllChanges(instance.changePackage.domModifications);
      
      // Display all annotations
      annotationController.displayAllAnnotations(instance.changePackage.annotations);
      
      // Set as current package
      this.currentPackage = instance.changePackage;
      this.currentInstanceId = instanceId;
      
      return instance;
    } catch (error) {
      console.error('Error loading instance:', error);
      throw error;
    }
  }

  async autoSaveToInstance() {
    if (this.currentInstanceId) {
      // Update existing instance
      await firebaseManager.updateInstance(this.currentInstanceId, {
        changePackage: this.currentPackage,
        lastModified: new Date().toISOString()
      });
    }
  }

  generateInstanceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
```

### Firebase Integration

#### Firebase Manager
```javascript
class FirebaseManager {
  constructor() {
    this.db = getFirestore();
    this.auth = getAuth();
  }

  async saveInstance(instanceData) {
    try {
      const instanceRef = doc(this.db, 'instances', instanceData.instanceId);
      await setDoc(instanceRef, instanceData);
      
      // Update user's created instances
      const userRef = doc(this.db, 'users', instanceData.createdBy);
      await updateDoc(userRef, {
        instancesCreated: arrayUnion(instanceData.instanceId),
        lastActive: new Date().toISOString()
      });
      
      return instanceData.instanceId;
    } catch (error) {
      console.error('Error saving instance:', error);
      throw error;
    }
  }

  async loadInstance(instanceId) {
    try {
      const instanceRef = doc(this.db, 'instances', instanceId);
      const instanceDoc = await getDoc(instanceRef);
      
      if (instanceDoc.exists()) {
        const data = instanceDoc.data();
        
        // Add current user as collaborator if not already
        await this.addCollaboratorIfNew(instanceId, userManager.userKey);
        
        return data;
      } else {
        throw new Error('Instance not found');
      }
    } catch (error) {
      console.error('Error loading instance:', error);
      throw error;
    }
  }

  async updateInstance(instanceId, updates) {
    try {
      const instanceRef = doc(this.db, 'instances', instanceId);
      await updateDoc(instanceRef, updates);
    } catch (error) {
      console.error('Error updating instance:', error);
      throw error;
    }
  }

  async addCollaboratorIfNew(instanceId, userKey) {
    const instanceRef = doc(this.db, 'instances', instanceId);
    const instanceDoc = await getDoc(instanceRef);
    
    if (instanceDoc.exists()) {
      const data = instanceDoc.data();
      const existingCollaborator = data.collaborators.find(c => c.userKey === userKey);
      
      if (!existingCollaborator) {
        // Add new collaborator
        await updateDoc(instanceRef, {
          collaborators: arrayUnion({
            userKey: userKey,
            displayName: userManager.displayName,
            firstJoined: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            role: "collaborator"
          }),
          collaboratorUids: arrayUnion(userManager.currentUser.uid),
          lastModified: new Date().toISOString()
        });
        
        // Update user's collaborated instances
        const userRef = doc(this.db, 'users', userKey);
        await updateDoc(userRef, {
          instancesCollaborated: arrayUnion(instanceId),
          lastActive: new Date().toISOString()
        });
      }
    }
  }

  // Real-time listener for instance updates
  subscribeToInstance(instanceId, callback) {
    const instanceRef = doc(this.db, 'instances', instanceId);
    return onSnapshot(instanceRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data());
      }
    });
  }
}
```

### Updated Extension Popup

#### popup.html
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Page Puppet v2.0</title>
    <link rel="stylesheet" href="popup.css">
</head>
<body>
    <div class="puppet-popup">
        <!-- User Identity Section -->
        <div class="user-section">
            <div class="user-key">
                <label>Your Key:</label>
                <input type="text" id="user-key" maxlength="12" placeholder="USER4B7X">
                <button id="regenerate-key" title="Generate new key">🎲</button>
            </div>
            <div class="display-name">
                <input type="text" id="display-name" placeholder="Your Name (optional)">
            </div>
        </div>

        <!-- Mode Selection -->
        <div class="mode-selector">
            <button class="mode-btn active" data-mode="voice">🎤 Voice Control</button>
            <button class="mode-btn" data-mode="annotation">📝 Annotate</button>
        </div>
        
        <!-- Current Instance Info -->
        <div class="current-instance">
            <div class="instance-header">
                <input type="text" class="instance-title" placeholder="Instance name...">
                <span class="instance-id">ID: <span id="current-instance-id">-</span></span>
            </div>
            
            <div class="instance-stats">
                <span class="changes-count">🎛️ <span id="changes-count">0</span> changes</span>
                <span class="notes-count">📝 <span id="notes-count">0</span> notes</span>
                <span class="collaborators-count">👥 <span id="collaborators-count">1</span> people</span>
            </div>
        </div>
        
        <!-- Instance Actions -->
        <div class="instance-actions">
            <button id="create-new-instance">📋 Save as New Instance</button>
            <div class="share-section">
                <input type="text" id="share-url" readonly placeholder="No instance to share">
                <button id="copy-link">📋 Copy</button>
            </div>
        </div>
        
        <!-- Quick Actions -->
        <div class="quick-actions">
            <button id="view-all-notes">View All Notes</button>
            <button id="export-package">Export Package</button>
            <button id="load-instance">Load Instance ID</button>
        </div>

        <!-- Status -->
        <div class="status" id="status"></div>
    </div>

    <script src="popup.js"></script>
</body>
</html>
```

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can read/write their own user document
    match /users/{userKey} {
      allow read, write: if request.auth != null && 
        resource.data.firebaseUid == request.auth.uid;
    }
    
    // Anyone can read public instances, authenticated users can create/update
    match /instances/{instanceId} {
      allow read: if resource.data.isPublic == true;
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
        request.auth.uid in resource.data.collaboratorUids;
    }
  }
}
```

### Setup Instructions

#### 1. Firebase Setup
```bash
# Install Firebase SDK
npm install firebase

# Initialize Firebase project
firebase init firestore
```

#### 2. Extension Manifest Updates
```json
{
  "manifest_version": 3,
  "name": "Page Puppet v2.0",
  "version": "2.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>",
    "https://*.firebaseapp.com/*",
    "https://*.googleapis.com/*"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js", "content-script.js"],
    "run_at": "document_idle"
  }]
}
```

#### 3. Firebase Configuration
```javascript
// firebase-config.js
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "page-puppet.firebaseapp.com",
  projectId: "page-puppet",
  storageBucket: "page-puppet.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

## User Workflows

### Scenario 1: Designer Review
1. Designer receives URL: `client-site.com/homepage?puppet_instance=ABC123XYZ`
2. Extension auto-loads instance, applies all changes and shows annotations
3. Designer switches to annotation mode, clicks elements to add feedback
4. Notes like "Move this section up" and "Change to brand blue" are added
5. Designer saves as new instance, shares updated URL with developer

### Scenario 2: Client Feedback Loop
1. Developer creates mockup using voice commands
2. Saves instance and shares URL with client
3. Client opens URL, sees all changes, adds approval notes and change requests
4. Developer loads client's instance, sees consolidated feedback
5. Implements changes using voice commands, creates final version

### Scenario 3: Team Collaboration
1. Multiple team members access same instance URL simultaneously
2. Real-time updates show everyone's notes as they're added
3. Voice changes and annotations sync across all users
4. Project manager reviews all feedback in one consolidated view
5. Final implementation instance created with all input incorporated

## Development Phases

### Phase 1: Core Infrastructure (Week 1-2)
- Firebase setup and authentication
- Anonymous user system
- Basic instance creation and loading
- URL parameter handling

### Phase 2: Annotation System (Week 3-4)
- Annotation mode toggle
- Note creation interface
- Visual annotation overlays
- Note type categorization

### Phase 3: Package Management (Week 5-6)
- Change package system
- Auto-save functionality
- Instance browser interface
- Share URL generation

### Phase 4: Real-time Collaboration (Week 7-8)
- Firestore real-time listeners
- Multi-user synchronization
- Collaborative features testing
- Performance optimization

### Phase 5: Polish & Testing (Week 9-10)
- UI/UX refinements
- Comprehensive testing
- Demo scenarios validation
- Documentation updates

## Success Metrics
- Users can create and share annotated instances without accounts
- Multiple users can collaborate on same instance in real-time
- All voice commands and annotations persist across sessions
- URL sharing works reliably for instant collaboration
- Performance remains smooth with multiple collaborators
- Anonymous system provides sufficient identity management

This v2.0 architecture provides a complete collaborative design review and iteration workflow while maintaining the simplicity of anonymous participation and the power of real-time voice control.
