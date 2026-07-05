def dialogue_record(curriculum, prompt, response, idx, language="zh"):
    return {
        "record_id": f"r27a6_dialogue_{curriculum}_{idx:06d}",
        "curriculum": curriculum,
        "language": language,
        "prompt": prompt,
        "response": response,
        "text": f"<|user|>\n{prompt}\n<|assistant|>\n{response}\n<|end|>",
        "contains_cot": False,
        "contains_hidden_prompt": False,
        "contains_private_data": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
        "allowed_to_train_engineering": True,
        "allowed_to_commit_raw": False,
        "provenance": {"phase": "R27A6", "engineering_only": True, "transformation_type": "dialogue_product_curriculum"},
    }
