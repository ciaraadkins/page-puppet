const DOM_ACTION_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "changeColor", "changeBackgroundColor", "changeSize",
        "changeWidth", "changeHeight", "changeOpacity",
        "rotate", "addShadow", "changeBorder",
        "hide", "show", "changeText", "addText"
      ]
    },
    target: {
      type: "string",
      description: "Description of the target element"
    },
    value: {
      type: "string",
      description: "New value to apply (color name, size, text, etc.)"
    },
    confidence: {
      type: "number",
      description: "Confidence level 0-1 for this interpretation"
    }
  },
  required: ["action", "target", "value", "confidence"],
  additionalProperties: false
};

function buildCommandPrompt(transcript, elementContext) {
  return `You are a voice command interpreter for web page manipulation.
Current element context: ${JSON.stringify(elementContext)}
User said: "${transcript}"

ELEMENT TYPE PRIORITY RULES (CRITICAL):
- For visual elements (div.shape, canvas, svg, img, colored divs): STRONGLY prefer visual actions (changeColor, changeBackgroundColor, changeSize, rotate, addShadow)
- For elements with minimal/no text content (<10 chars): PREFER visual actions over text actions
- For elements with className containing "shape", "visual", "graphic", "color": ALWAYS prefer visual actions
- For text elements (p, h1-h6, span with substantial text): Consider both visual and text actions
- For form elements (input, textarea, button): Consider text changes only if user explicitly mentions text content
- When element serves primarily visual purpose: NEVER use changeText or addText unless explicitly requested

COMMAND DISAMBIGUATION (CRITICAL):
- "make it [color]" = visual change (changeColor/changeBackgroundColor)
- "change this to [color]" = visual change (changeColor/changeBackgroundColor)
- "turn it [color]" = visual change (changeColor/changeBackgroundColor)
- "change this color" = visual change (changeColor/changeBackgroundColor)
- "make this [color]" = visual change (changeColor/changeBackgroundColor)
- ONLY "change text to X" or "add text X" should trigger text actions

VISUAL ELEMENT EXAMPLES:
- "make it yellow" on colored div/shape = changeBackgroundColor: yellow (NOT changeText)
- "change this to red" on visual element = changeBackgroundColor: red
- "make this blue" on shape/visual element = changeBackgroundColor: blue
- "turn it green" on colored element = changeBackgroundColor: green

CRITICAL RULES for highlighting commands:
- "highlight", "highlight this", "highlight this text" = changeBackgroundColor ONLY
- NEVER change text content when user says "highlight"
- "this text" in highlighting context refers to the existing element content, not replacement text
- Highlighting means background color change, not text modification

IMPORTANT for text commands:
- NEVER use placeholder text like "Hello World", "Sample text", "Test text", etc.
- ONLY use text that the user explicitly spoke
- If the user's speech is unclear or incomplete, return null instead of guessing
- Do not be helpful by suggesting default text - only use the user's actual words
- Text commands require explicit new text content (e.g., "change text to hello")

Common examples:
- "make it bigger" = changeSize: bigger
- "hide it" = hide
- "highlight this" → changeBackgroundColor: yellow
- "rotate it" = rotate: 45deg

Return a structured command or null if not a valid command.`;
}
