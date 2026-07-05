# R27B3 Evidence Packet Schema

The R27B3 packet shape is:

```json
{
  "query": "...",
  "retrieved_evidence": [
    {
      "source_id": "...",
      "title": "...",
      "text": "...",
      "trust_level": "high | medium | low",
      "retrieval_score": 0,
      "license_or_origin": "...",
      "can_answer": true
    }
  ],
  "evidence_status": "sufficient | insufficient | conflicting | irrelevant",
  "answer_policy_hint": "answer | refuse | challenge_premise | ask_clarifying | identify_conflict"
}
```

The verifier treats insufficient, conflicting, irrelevant, empty, and instruction-injection evidence as fallback conditions. Evidence can guide the draft path, but it is never treated as an instruction channel.
