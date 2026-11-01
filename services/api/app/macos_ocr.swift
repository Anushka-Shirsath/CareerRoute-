import Foundation
import Vision
import ImageIO

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { exit(1) }
let width = Double(image.width), height = Double(image.height)

func recognise(_ level: VNRequestTextRecognitionLevel) throws -> [VNRecognizedTextObservation] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image).perform([request])
    return request.results ?? []
}

// The accurate pass reads characters better but can skip whole lines, so
// lines that only the fast pass found are added where nothing overlaps them.
let accurate = try recognise(.accurate)
var observations = accurate
for candidate in try recognise(.fast) {
    let box = candidate.boundingBox
    if !accurate.contains(where: { $0.boundingBox.intersection(box).height > min($0.boundingBox.height, box.height) * 0.5
        && $0.boundingBox.intersection(box).width > 0 }) {
        observations.append(candidate)
    }
}

// A phone photo is rarely level. Measure the tilt of the longer text lines
// and group words into rows along that angle, so a subject name stays on the
// same line as its marks.
let angles = observations.filter { $0.boundingBox.width > 0.15 }.map {
    atan2(Double($0.topRight.y - $0.topLeft.y) * height, Double($0.topRight.x - $0.topLeft.x) * width)
}.sorted()
let tilt = angles.isEmpty ? 0 : angles[angles.count / 2]

struct Word { let text: String; let along: Double; let across: Double; let size: Double }
let words: [Word] = observations.compactMap { observation in
    guard let text = observation.topCandidates(1).first?.string else { return nil }
    let x = Double(observation.boundingBox.midX) * width, y = Double(observation.boundingBox.midY) * height
    return Word(text: text,
                along: x * cos(tilt) + y * sin(tilt),
                across: y * cos(tilt) - x * sin(tilt),
                size: Double(observation.boundingBox.height) * height)
}

var rows: [[Word]] = []
for word in words.sorted(by: { $0.across > $1.across }) {
    if let index = rows.firstIndex(where: { row in
        let centre = row.map(\.across).reduce(0, +) / Double(row.count)
        return abs(centre - word.across) < max(row[0].size, word.size) * 0.6
    }) {
        rows[index].append(word)
    } else {
        rows.append([word])
    }
}
for row in rows {
    print(row.sorted { $0.along < $1.along }.map(\.text).joined(separator: " "))
}
