import AppKit
import QuickLookThumbnailing

struct GenerationFailure: Error, CustomStringConvertible {
    let description: String
}

struct TauriConfig: Decodable {
    struct Bundle: Decodable {
        struct MacOS: Decodable {
            let minimumSystemVersion: String
        }

        let macOS: MacOS
    }

    let bundle: Bundle
}

let fileManager = FileManager.default
let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let tauriDir = repoRoot.appendingPathComponent("src-tauri")
let iconsDir = tauriDir.appendingPathComponent("icons")
let iconSource = iconsDir.appendingPathComponent("Echo.icon")
let iconName = iconSource.deletingPathExtension().lastPathComponent
let workDir = fileManager.temporaryDirectory.appendingPathComponent("echo-app-icons-\(UUID().uuidString)")

let icnsPointSizes = [16, 32, 128, 256, 512]
let icoSizes = [16, 20, 24, 32, 40, 48, 64, 256]
let linuxPngs = [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)]

@discardableResult
func run(_ executable: String, _ arguments: [String]) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardInput = FileHandle.nullDevice
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe
    try process.run()
    let output = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
        throw GenerationFailure(description: "\(executable) \(arguments.joined(separator: " ")) failed:\n\(output)")
    }
    return output
}

func minimumMacOSVersion() throws -> String {
    let data = try Data(contentsOf: tauriDir.appendingPathComponent("tauri.conf.json"))
    return try JSONDecoder().decode(TauriConfig.self, from: data).bundle.macOS.minimumSystemVersion
}

func iconComposerTool() throws -> String {
    let developerDir = try run("/usr/bin/xcode-select", ["-p"]).trimmingCharacters(in: .whitespacesAndNewlines)
    let ictool = URL(fileURLWithPath: developerDir)
        .deletingLastPathComponent()
        .appendingPathComponent("Applications/Icon Composer.app/Contents/Executables/ictool")
    guard fileManager.isExecutableFile(atPath: ictool.path) else {
        throw GenerationFailure(description: "Icon Composer not found at \(ictool.path): install Xcode 26 or later")
    }
    return ictool.path
}

func compileAssetCatalog(minimumVersion: String) throws -> URL {
    let outputDir = workDir.appendingPathComponent("actool")
    try fileManager.createDirectory(at: outputDir, withIntermediateDirectories: true)
    let output = try run("/usr/bin/xcrun", [
        "actool", iconSource.path,
        "--compile", outputDir.path,
        "--output-partial-info-plist", outputDir.appendingPathComponent("partial.plist").path,
        "--app-icon", iconName,
        "--include-all-app-icons",
        "--enable-on-demand-resources", "NO",
        "--development-region", "en",
        "--target-device", "mac",
        "--minimum-deployment-target", minimumVersion,
        "--platform", "macosx",
        "--errors", "--warnings",
        "--output-format", "human-readable-text",
    ])
    let assetsCar = outputDir.appendingPathComponent("Assets.car")
    guard fileManager.fileExists(atPath: assetsCar.path) else {
        throw GenerationFailure(description: "actool produced no Assets.car:\n\(output)")
    }
    return assetsCar
}

func renderBundle(assetsCar: URL) throws -> URL {
    let bundle = workDir.appendingPathComponent("\(iconName).app")
    let contents = bundle.appendingPathComponent("Contents")
    let resources = contents.appendingPathComponent("Resources")
    let executables = contents.appendingPathComponent("MacOS")
    try fileManager.createDirectory(at: resources, withIntermediateDirectories: true)
    try fileManager.createDirectory(at: executables, withIntermediateDirectories: true)
    try fileManager.copyItem(at: assetsCar, to: resources.appendingPathComponent("Assets.car"))
    // Without an executable, macOS badges the app as broken in its icon.
    try fileManager.copyItem(at: URL(fileURLWithPath: "/usr/bin/true"), to: executables.appendingPathComponent("stub"))
    let infoPlist = [
        "CFBundleExecutable": "stub",
        "CFBundleIconName": iconName,
        "CFBundleIdentifier": "com.echo.icon-render.\(UUID().uuidString)",
        "CFBundlePackageType": "APPL",
    ]
    try PropertyListSerialization.data(fromPropertyList: infoPlist, format: .xml, options: 0)
        .write(to: contents.appendingPathComponent("Info.plist"))
    return bundle
}

func pngData(size: Int, draw: (CGContext) -> Void) throws -> Data {
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(
              data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
              space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          )
    else {
        throw GenerationFailure(description: "Could not create a \(size)px bitmap")
    }
    context.interpolationQuality = .high
    draw(context)
    guard let image = context.makeImage(),
          let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    else {
        throw GenerationFailure(description: "Could not encode the \(size)px PNG")
    }
    return png
}

@MainActor
func writeIcns(renderBundle bundle: URL) async throws {
    let iconset = workDir.appendingPathComponent("icon.iconset")
    try fileManager.createDirectory(at: iconset, withIntermediateDirectories: true)
    for points in icnsPointSizes {
        for scale in [1, 2] {
            let pixels = points * scale
            let request = QLThumbnailGenerator.Request(
                fileAt: bundle,
                size: CGSize(width: points, height: points),
                scale: CGFloat(scale),
                representationTypes: .icon
            )
            let icon = try await QLThumbnailGenerator.shared.generateBestRepresentation(for: request).cgImage
            let png = try pngData(size: pixels) { context in
                context.draw(icon, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
            }
            let suffix = scale == 1 ? "" : "@2x"
            try png.write(to: iconset.appendingPathComponent("icon_\(points)x\(points)\(suffix).png"))
        }
    }
    try run("/usr/bin/iconutil", ["-c", "icns", iconset.path, "-o", iconsDir.appendingPathComponent("icon.icns").path])
}

func paddedPng(size: Int, ictool: String) throws -> Data {
    let margin = Int((Double(size) / 16).rounded())
    let body = size - 2 * margin
    let render = workDir.appendingPathComponent("flat-\(body).png")
    if !fileManager.fileExists(atPath: render.path) {
        try run(ictool, [
            iconSource.path, "--export-image", "--output-file", render.path,
            "--platform", "macOS", "--rendition", "Default",
            "--width", "\(body)", "--height", "\(body)", "--scale", "1",
        ])
    }
    guard let image = NSImage(contentsOf: render)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        throw GenerationFailure(description: "Could not read \(render.path)")
    }
    return try pngData(size: size) { context in
        context.draw(image, in: CGRect(x: margin, y: margin, width: body, height: body))
    }
}

func icoData(_ entries: [(size: Int, png: Data)]) -> Data {
    var data = Data()
    func append<T: FixedWidthInteger>(_ value: T) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
    append(UInt16(0))
    append(UInt16(1))
    append(UInt16(entries.count))
    var offset = 6 + 16 * entries.count
    for entry in entries {
        let dimension = UInt8(entry.size % 256)
        append(dimension)
        append(dimension)
        append(UInt8(0))
        append(UInt8(0))
        append(UInt16(1))
        append(UInt16(32))
        append(UInt32(entry.png.count))
        append(UInt32(offset))
        offset += entry.png.count
    }
    for entry in entries {
        data.append(entry.png)
    }
    return data
}

do {
    defer { try? fileManager.removeItem(at: workDir) }
    let ictool = try iconComposerTool()
    let assetsCar = try compileAssetCatalog(minimumVersion: minimumMacOSVersion())
    let committedCar = iconsDir.appendingPathComponent("Assets.car")
    try? fileManager.removeItem(at: committedCar)
    try fileManager.copyItem(at: assetsCar, to: committedCar)
    try await writeIcns(renderBundle: renderBundle(assetsCar: assetsCar))
    let ico = try icoData(icoSizes.map { (size: $0, png: try paddedPng(size: $0, ictool: ictool)) })
    try ico.write(to: iconsDir.appendingPathComponent("icon.ico"))
    for (file, size) in linuxPngs {
        try paddedPng(size: size, ictool: ictool).write(to: iconsDir.appendingPathComponent(file))
    }
    print("Generated Assets.car, icon.icns, icon.ico and \(linuxPngs.map(\.0).joined(separator: ", ")) in \(iconsDir.path)")
} catch {
    FileHandle.standardError.write(Data("generate-app-icons: \(error)\n".utf8))
    exit(1)
}
