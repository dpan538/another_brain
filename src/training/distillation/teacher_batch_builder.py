def build_teacher_prompt(prompt):
    return {
        "prompt": prompt,
        "instructions": "Return final answer only. Do not include chain-of-thought, hidden reasoning, secrets, private data, or eval prompt text.",
    }
