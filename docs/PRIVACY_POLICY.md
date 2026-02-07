# Privacy Policy for Pagician

**Last Updated:** December 22, 2024

## Overview

Pagician is a Chrome extension that enables voice control of web page elements using natural language commands. This privacy policy explains how we collect, use, and protect your information when you use our extension.

## Information We Collect

### Information Stored Locally
- **OpenAI API Key** (optional): If you provide your own API key, it is stored securely in your browser's local storage and never transmitted to our servers
- **Usage Statistics**: Trial request count and settings preferences stored locally in your browser
- **Extension Settings**: Your configuration preferences (confidence threshold, recording duration, display name)

### Information Processed During Use
- **Voice Audio**: When you use voice commands, audio is temporarily captured and sent to OpenAI's Whisper API for speech-to-text conversion
- **Element Context**: Information about the webpage elements you interact with (tag names, styles, positions) to process your commands

## How We Use Your Information

### Voice Processing
- Audio recordings are sent to OpenAI's Whisper API for speech-to-text conversion
- Transcribed text is sent to OpenAI's GPT-4 API for command interpretation
- Audio is not stored permanently by us or OpenAI

### Extension Functionality
- API keys are used solely to authenticate with OpenAI services
- Usage statistics track your trial requests to manage the 100-request limit
- Settings are used to customize your extension experience

## Information Sharing and Third Parties

### OpenAI Services
- We use OpenAI's Whisper API for speech-to-text conversion
- We use OpenAI's GPT-4 API for natural language command processing
- Your data is subject to [OpenAI's Privacy Policy](https://openai.com/privacy/)
- We do not store or have access to your interactions with OpenAI

### No Data Collection by Us
- We do not collect, store, or transmit any personal data to our own servers
- We do not track your browsing history or website usage
- We do not sell, rent, or share your information with third parties

## Data Storage and Security

### Local Storage
- All extension data is stored locally in your browser using Chrome's secure storage APIs
- API keys are stored using Chrome's sync storage with encryption
- No data is transmitted to external servers except for OpenAI API calls

### Data Retention
- Local data persists until you uninstall the extension or manually clear it
- You can delete your API key and reset usage statistics at any time through the extension settings

## Your Rights and Controls

### Data Control
- **Access**: View your stored data through the extension's settings page
- **Modification**: Change or update your API key and preferences at any time
- **Deletion**: Remove all stored data by uninstalling the extension or using the reset options

### Opt-Out Options
- Use your own OpenAI API key to avoid our trial service
- Disable voice recognition to prevent audio processing
- Uninstall the extension to stop all data processing

## Children's Privacy

Pagician is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can delete such information.

## Updates to This Policy

We may update this privacy policy from time to time. When we do, we will:
- Update the "Last Updated" date at the top of this policy
- Notify users of significant changes through the extension's update notifications
- Continue to protect your data according to the terms in effect when it was collected

## Compliance

This privacy policy complies with:
- Google Chrome Web Store Developer Program Policies
- California Consumer Privacy Act (CCPA) where applicable
- General Data Protection Regulation (GDPR) where applicable

## Third-Party Services

### OpenAI
- **Service**: Speech-to-text and natural language processing
- **Data Shared**: Voice audio and transcribed text
- **Privacy Policy**: https://openai.com/privacy/
- **Data Retention**: Subject to OpenAI's policies

### Chrome APIs
- We use Chrome's storage, scripting, and activeTab APIs
- No additional data is shared with Google beyond standard extension functionality

## Technical Details

### Permissions Explanation
- **activeTab**: Required to interact with the current webpage you're viewing
- **storage**: Required to save your API key and settings locally
- **scripting**: Required to inject voice control functionality into webpages
- **contextMenus**: Required for right-click menu options (if implemented)

### Host Permissions
- **<all_urls>**: Required because voice control needs to work on any website you visit
- This permission does not grant us access to your data; it only allows the extension to function on all websites

## Contact Information

If you have questions about this privacy policy or our privacy practices, please contact us:

- **Email**: [Create an email address for support]
- **GitHub Issues**: https://github.com/ciaraadkins/page-puppet/issues
- **Project Repository**: https://github.com/ciaraadkins/page-puppet

## Legal Basis for Processing (GDPR)

Where applicable under GDPR, our legal basis for processing your personal data is:
- **Legitimate Interest**: To provide voice control functionality you've requested
- **Consent**: When you provide your API key and use voice commands
- **Contract Performance**: To deliver the extension services you've chosen to use

## Data Protection Officer

For GDPR-related inquiries, you may contact our Data Protection Officer at [Create a DPO contact if needed for EU compliance].

---

**Effective Date:** December 22, 2024

This privacy policy is part of our commitment to transparency and protecting your privacy while using Pagician. By using our extension, you agree to the collection and use of information in accordance with this policy.