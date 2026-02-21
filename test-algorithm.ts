import { analyzeConversation } from './src/algorithm/index';

const mockClaudeChat = `
Claude said:
Certainly! Here is the analysis you requested [cite:1].

### 🛠️ Strategic Implementation
As we discussed earlier, the **primary objective ** is to ensure stability.

| Category | Priority | Impact |
| --- | --- | ---|
| Performance | High | Significant |
| Security | Critical | Vital |

Furthermore [2], the following Mermaid diagram explains the flow:

\`\`\`mermaid
graph TD;
  A[Input] --> B{Process};
  B -- Success --> C[Output];
  B -- Fail --> D[Error];
\n
Wait, I forgot to close this code block...
\`\`\` (missing in original, but added for test)
Actually, let's simulate a broken one:
\`\`\`javascript
function test() {
  console.log("Broken fence";

[cite: 3]
`;

console.log("🚀 STARTING MOCK CLAUDE TEST\n");
const result = analyzeConversation(mockClaudeChat);

result.messages.forEach((msg, i) => {
    console.log(`--- BLOCK ${i} [${msg.role.toUpperCase()}] ---`);
    console.log(`CONFIDENCE: ${msg.confidence.toFixed(2)}`);
    console.log(`INTENT: ${msg.intent.join(', ')}`);
    console.log(`TOPIC: ${msg.topic.join(', ')}`);
    console.log("TEXT CONTENT:");
    console.log(msg.text);
    console.log("\n");
});

console.log("✅ TEST COMPLETE");
