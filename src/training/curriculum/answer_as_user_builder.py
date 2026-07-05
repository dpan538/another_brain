from src.training.curriculum.dialogue_product_builder import dialogue_record


def answer_as_user_record(prompt, response, idx, language="mixed"):
    return dialogue_record("sft_answer_as_user", prompt, response, idx, language=language)
