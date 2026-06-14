#!/usr/bin/env swift
import Foundation
import Vision

struct InputItem: Codable {
    let ref: String
    let path: String
}

struct Label: Codable {
    let text: String
    let confidence: Float
}

struct OutputItem: Codable {
    let ref: String
    let available: Bool
    let ocrText: String
    let labels: [Label]
    let error: String?
    let elapsedMs: Int

    enum CodingKeys: String, CodingKey {
        case ref
        case available
        case ocrText = "ocr_text"
        case labels
        case error
        case elapsedMs = "elapsed_ms"
    }
}

func emit(_ output: OutputItem) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(output), let text = String(data: data, encoding: .utf8) {
        print(text)
        fflush(stdout)
    }
}

func process(item: InputItem) -> OutputItem {
    let started = Date()
    let url = URL(fileURLWithPath: item.path)
    var ocrLines: [String] = []
    var labels: [Label] = []
    var errors: [String] = []

    let textRequest = VNRecognizeTextRequest { request, _ in
        guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
        for observation in observations {
            if let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.45 {
                ocrLines.append(candidate.string)
            }
        }
    }
    textRequest.recognitionLevel = .accurate
    textRequest.usesLanguageCorrection = true
    textRequest.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]

    let classifyRequest = VNClassifyImageRequest { request, _ in
        guard let observations = request.results as? [VNClassificationObservation] else { return }
        for observation in observations.prefix(8) where observation.confidence >= 0.15 {
            labels.append(Label(text: observation.identifier, confidence: observation.confidence))
        }
    }

    do {
        try VNImageRequestHandler(url: url, options: [:]).perform([textRequest])
    } catch {
        errors.append("ocr:\(String(describing: error))")
    }

    do {
        try VNImageRequestHandler(url: url, options: [:]).perform([classifyRequest])
    } catch {
        errors.append("classify:\(String(describing: error))")
    }

    let elapsed = Int(Date().timeIntervalSince(started) * 1000)
    let hasSuccessfulPass = errors.count < 2
    return OutputItem(
        ref: item.ref,
        available: hasSuccessfulPass,
        ocrText: ocrLines.joined(separator: "\n"),
        labels: labels,
        error: errors.isEmpty ? nil : errors.joined(separator: " | "),
        elapsedMs: elapsed
    )
}

guard CommandLine.arguments.count >= 2 else {
    emit(OutputItem(ref: "", available: false, ocrText: "", labels: [], error: "missing_manifest", elapsedMs: 0))
    exit(1)
}

let manifestURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let handle = try? FileHandle(forReadingFrom: manifestURL) else {
    emit(OutputItem(ref: "", available: false, ocrText: "", labels: [], error: "manifest_unreadable", elapsedMs: 0))
    exit(1)
}

let decoder = JSONDecoder()
let data = handle.readDataToEndOfFile()
guard let text = String(data: data, encoding: .utf8) else {
    emit(OutputItem(ref: "", available: false, ocrText: "", labels: [], error: "manifest_decode_failed", elapsedMs: 0))
    exit(1)
}

for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
    autoreleasepool {
        guard let itemData = String(line).data(using: .utf8),
              let item = try? decoder.decode(InputItem.self, from: itemData) else {
            emit(OutputItem(ref: "", available: false, ocrText: "", labels: [], error: "manifest_line_decode_failed", elapsedMs: 0))
            return
        }
        emit(process(item: item))
    }
}
