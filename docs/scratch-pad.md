Address project review items (#3-#10) from project-review-20260207.md

- #3: Split content-script.js monolith (1,400 lines) into 7 focused files under lib/ (logger, audio-capture, speech-processor, command-processor, element-detector, dom-manipulator) loaded via manifest content_scripts array
- #4: Consolidate 4 duplicated log() functions into shared lib/logger.js with configureLogger() for per-context config (background, popup, options, content); delete unused root logger.js
- #5: Extract 45-line inline system prompt and DOM_ACTION_SCHEMA from CommandProcessor into lib/prompts.js with buildCommandPrompt() function
- #6: Replace setInterval audio streaming loop with recursive setTimeout (scheduleNextCycle) for error recovery — each cycle only starts after the previous one completes
- #7: Rolled into audio-chunking-improvements.md — persistent AudioContext will be solved naturally by the planned VAD implementation
- #8: Remove unimplemented changePosition from schema enum; logger.js already fixed in #4; settings (confidence/duration) left as-is since recording duration is moot with planned VAD and confidence has better dynamic logic than a single slider
- #9: Remove all legacy openaiApiKey compatibility code — dead getApiKey handler in background.js, migration logic in api-key-manager.js, fallback reads in popup/sidepanel/options; all API key handling now uses userApiKey exclusively
- #10: Fix rotate() double-deg bug (45deg -> 45degdeg); remove invalid privacy_policy manifest key; fix popup permission check error on system pages (chrome://, chrome-extension://)
