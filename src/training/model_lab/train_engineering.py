from src.training.model_lab.mini_decoder import BigramEngineeringDecoder


def train_bigram_decoder(tokenized_sequences, vocab_size, max_steps=100):
    model = BigramEngineeringDecoder(vocab_size)
    if not tokenized_sequences:
        raise ValueError("no_training_sequences")
    start_loss = model.loss(tokenized_sequences)
    steps = 0
    for seq in tokenized_sequences:
        model.update(seq)
        steps += 1
        if steps >= max_steps:
            break
    end_loss = model.loss(tokenized_sequences)
    return model, {"steps": steps, "train_loss_start": start_loss, "train_loss_end": end_loss}
