import AppKit
import ApplicationServices
import CoreGraphics
import Darwin

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
}

let previewTitle = "Echo Dock Preview"
let liftDistance: CGFloat = 40

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() {
        throw SmokeFailure(description: message)
    }
}

func step(_ text: String) {
    print("  \(text)")
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

func findElement(in root: AXUIElement, depth: Int = 32, labelled label: String) -> AXUIElement? {
    if [kAXTitleAttribute, kAXDescriptionAttribute].contains(where: { attribute(root, $0) as? String == label }) {
        return root
    }
    guard depth > 0 else {
        return nil
    }
    let children = attribute(root, kAXChildrenAttribute) as? [AXUIElement] ?? []
    return children.lazy.compactMap { findElement(in: $0, depth: depth - 1, labelled: label) }.first
}

func center(of element: AXUIElement) throws -> CGPoint {
    var position = CGPoint.zero
    var size = CGSize.zero
    guard
        let rawPosition = attribute(element, kAXPositionAttribute),
        let rawSize = attribute(element, kAXSizeAttribute),
        CFGetTypeID(rawPosition) == AXValueGetTypeID(),
        CFGetTypeID(rawSize) == AXValueGetTypeID(),
        AXValueGetValue(unsafeBitCast(rawPosition, to: AXValue.self), .cgPoint, &position),
        AXValueGetValue(unsafeBitCast(rawSize, to: AXValue.self), .cgSize, &size)
    else {
        throw SmokeFailure(description: "Could not resolve the grip frame")
    }
    return CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2)
}

func postMouse(_ type: CGEventType, at point: CGPoint) {
    CGEvent(
        mouseEventSource: CGEventSource(stateID: .combinedSessionState),
        mouseType: type,
        mouseCursorPosition: point,
        mouseButton: .left
    )?.post(tap: .cghidEventTap)
}

func echoProcessIdentifier() throws -> pid_t {
    if CommandLine.arguments.count > 1, let value = Int32(CommandLine.arguments[1]) {
        return value
    }
    let process = NSWorkspace.shared.runningApplications.last { application in
        application.executableURL?.lastPathComponent == "echo-app" ||
            application.bundleIdentifier == "com.damien-schneider.echo"
    }
    guard let process else {
        throw SmokeFailure(description: "Echo is not running")
    }
    return process.processIdentifier
}

/// WebKit builds the overlay's accessibility tree on first request.
func waitForGrip(in echo: AXUIElement) throws -> AXUIElement {
    let deadline = Date().addingTimeInterval(1.5)
    repeat {
        let windows = attribute(echo, kAXWindowsAttribute) as? [AXUIElement] ?? []
        let resident = windows.first { attribute($0, kAXTitleAttribute) as? String == "Recording" }
        if let resident, let grip = findElement(in: resident, labelled: "Move Echo control") {
            return grip
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    } while Date() < deadline
    throw SmokeFailure(description: "Could not find the island's grip")
}

func displayBounds(containing point: CGPoint) throws -> CGRect {
    var display = CGDirectDisplayID()
    var count: UInt32 = 0
    guard CGGetDisplaysWithPoint(point, 1, &display, &count) == .success, count == 1 else {
        throw SmokeFailure(description: "No display under the grip")
    }
    return CGDisplayBounds(display)
}

/// The window server reports the frame mid-animation: each sample is what the user saw.
struct PreviewWatch {
    let pid: pid_t
    var frames: [CGRect] = []

    mutating func hold(for duration: TimeInterval) {
        let deadline = Date().addingTimeInterval(duration)
        repeat {
            if let frame = previewFrame(), frames.last != frame {
                frames.append(frame)
            }
            usleep(1000)
        } while Date() < deadline
    }

    func previewFrame() -> CGRect? {
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
        let preview = windows.first { window in
            window[kCGWindowOwnerPID as String] as? pid_t == pid &&
                window[kCGWindowName as String] as? String == previewTitle
        }
        guard let bounds = preview?[kCGWindowBounds as String] as? NSDictionary else {
            return nil
        }
        return CGRect(dictionaryRepresentation: bounds)
    }
}

func dragOffTheEdgeAndBack(from grip: CGPoint, toward target: CGPoint, watch: inout PreviewWatch) {
    let length = hypot(target.x - grip.x, target.y - grip.y)
    let point = { (distance: CGFloat) in
        CGPoint(x: grip.x + (target.x - grip.x) / length * distance, y: grip.y + (target.y - grip.y) / length * distance)
    }
    postMouse(.leftMouseDown, at: grip)
    watch.hold(for: 0.1)
    for distance in stride(from: 1, through: liftDistance, by: 1) {
        postMouse(.leftMouseDragged, at: point(distance))
        watch.hold(for: 0.008)
    }
    watch.hold(for: 0.4)
    for distance in stride(from: liftDistance - 1, through: 0, by: -1) {
        postMouse(.leftMouseDragged, at: point(distance))
        watch.hold(for: 0.008)
    }
    postMouse(.leftMouseUp, at: grip)
    watch.hold(for: 1)
}

let savedCursor = CGEvent(source: nil)?.location ?? .zero
var exitCode: Int32 = 0

do {
    try require(CGPreflightPostEventAccess(), "Synthetic input permission is unavailable")
    try require(AXIsProcessTrusted(), "Accessibility permission is unavailable for this terminal")
    let echoPid = try echoProcessIdentifier()
    let grip = try center(of: try waitForGrip(in: AXUIElementCreateApplication(echoPid)))
    let display = try displayBounds(containing: grip)
    print("Given the island docked to a screen edge")
    CGAssociateMouseAndMouseCursorPosition(boolean_t(0))
    CGWarpMouseCursorPosition(grip)
    postMouse(.mouseMoved, at: grip)
    var watch = PreviewWatch(pid: echoPid)
    watch.hold(for: 0.5)
    step("When the user drags it off the edge and drops it back")
    dragOffTheEdgeAndBack(from: grip, toward: CGPoint(x: display.midX, y: display.midY), watch: &watch)
    step("Then the dock preview covers the screen from its first frame to its last")
    try require(!watch.frames.isEmpty, "The dock preview never showed during the drag")
    let strays = watch.frames.filter { $0 != display }
    try require(strays.isEmpty, "The dock preview animated through \(strays) instead of covering \(display)")
    print("PASS: the dock preview never scaled in or out around the island")
} catch {
    fputs("FAIL: \(error)\n", stderr)
    exitCode = 1
}

CGWarpMouseCursorPosition(savedCursor)
postMouse(.mouseMoved, at: savedCursor)
CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
exit(exitCode)
