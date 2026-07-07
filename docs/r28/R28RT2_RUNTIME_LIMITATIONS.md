# R28RT2 Runtime Limitations

Readable generation smoke is not quality admission.

Known limitations:

- exact tokenizer vocabulary is not committed
- decode uses a lossy runtime display codec
- generated text may be low quality or semantically weak
- product admission is not done
- browser admission is not done
- release checkpoint admission is not done
- Vercel preview is not checked
- manual QA is required

R28RT2 only verifies that the committed q4 runtime can produce real token ids and display non-empty readable text without backend or external inference.
