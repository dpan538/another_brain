from src.training.distillation.candidate_queue import read_jsonl


def stratified_counts(path):
    counts = {}
    for row in read_jsonl(path):
        curr = row.get("curriculum", "unknown")
        counts[curr] = counts.get(curr, 0) + 1
    return counts
