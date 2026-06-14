#!/usr/bin/env swift
import Foundation
import Vision

struct Output: Codable {
    let available: Bool
    let ocrText: String
    let labels: [Label]
    let error: String?

    enum CodingKeys: String, CodingKey {
        case available
        case ocrText = "ocr_text"
        case labels
        case error
    }
}

struct Label: Codable {
    let text: String
    let confidence: Float
}

func emit(_ output: Output) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(output), let text = String(data: data, encoding: .utf8) {
        print(text)
    }
}

guard CommandLine.arguments.count >= 2 else {
    emit(Output(available: false, ocrText: "", labels: [], error: "missing_path"))
    exit(1)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
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

emit(Output(
    available: errors.count < 2,
    ocrText: ocrLines.joined(separator: "\n"),
    labels: labels,
    error: errors.isEmpty ? nil : errors.joined(separator: " | ")
))
