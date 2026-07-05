from src.training.curriculum.dialogue_product_builder import dialogue_record


def refusal_boundary_record(prompt, response, idx, language="zh"):
    return dialogue_record("sft_refusal_boundary", prompt, response, idx, language=language)
