import Foundation
import Vision
import ImageIO

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { exit(1) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: image).perform([request])
let observations = (request.results ?? []).sorted { a, b in
    if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.01 {
        return a.boundingBox.midY > b.boundingBox.midY
    }
    return a.boundingBox.minX < b.boundingBox.minX
}
var rows: [[VNRecognizedTextObservation]] = []
for observation in observations {
    if let index = rows.firstIndex(where: { abs($0[0].boundingBox.midY - observation.boundingBox.midY) < max($0[0].boundingBox.height, observation.boundingBox.height) * 0.6 }) {
        rows[index].append(observation)
    } else {
        rows.append([observation])
    }
}
for row in rows {
    print(row.sorted { $0.boundingBox.minX < $1.boundingBox.minX }
        .compactMap { $0.topCandidates(1).first?.string }.joined(separator: " "))
}
