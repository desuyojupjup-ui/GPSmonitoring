# GeoStride Cloud Functions

`analyzeFraud` — Claude-powered (claude-opus-4-8) attendance-fraud risk scoring.
The Anthropic API key stays server-side; clients call the function via the
Firebase callable SDK (`mobile/src/services/aiClient.js`,
`admin-dashboard/src/services/securityData.js`).

## Setup

```bash
cd functions
npm install
```

Provide the Anthropic key as a Firebase **secret** (the function declares
`secrets: ['ANTHROPIC_API_KEY']`):

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# paste your sk-ant-... key when prompted
```

For local emulation, create `functions/.env` (gitignored):

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```

## Run / deploy

```bash
# Local emulator (functions + firestore)
firebase emulators:start

# Deploy (requires Blaze plan)
firebase deploy --only functions
```

## Input / output

Request:  `{ employeeId: string }`
Response (also written to the `ai_analysis` collection):

```json
{
  "riskScore": 0,
  "riskLevel": "Clear|Low|Medium|High",
  "anomalies": [{ "type": "...", "detail": "...", "severity": "low|medium|high" }],
  "explanation": "...",
  "recommendations": ["..."]
}
```
