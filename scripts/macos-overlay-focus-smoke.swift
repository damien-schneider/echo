import AppKit
import ApplicationServices
import CoreGraphics
import Darwin

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
}

let residentCanvasSize = CGSize(width: 48, height: 136)
let chatCanvasSize = CGSize(width: 680, height: 620)
let stateTimeout: TimeInterval = 1.5
var recordingWindowID: CGWindowID?

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() {
        throw SmokeFailure(description: message)
    }
}

func recordingBounds(pid: pid_t) -> CGRect? {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    let rows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    for row in rows {
        guard
            let owner = row[kCGWindowOwnerPID as String] as? Int,
            owner == Int(pid),
            let rawWindowID = row[kCGWindowNumber as String] as? NSNumber,
            let layer = row[kCGWindowLayer as String] as? NSNumber,
            let alpha = row[kCGWindowAlpha as String] as? NSNumber,
            let raw = row[kCGWindowBounds as String] as? [String: Any],
            let x = raw["X"] as? NSNumber,
            let y = raw["Y"] as? NSNumber,
            let width = raw["Width"] as? NSNumber,
            let height = raw["Height"] as? NSNumber
        else {
            continue
        }
        let windowID = CGWindowID(rawWindowID.uint32Value)
        if let recordingWindowID, windowID != recordingWindowID {
            continue
        }
        let name = row[kCGWindowName as String] as? String
        let isOverlayPanel = name == "Recording" ||
            (layer.intValue > 0 && layer.intValue < 100 && alpha.doubleValue >= 0.99)
        guard isOverlayPanel else {
            continue
        }
        if recordingWindowID == nil {
            recordingWindowID = windowID
        }
        return CGRect(
            x: x.doubleValue,
            y: y.doubleValue,
            width: width.doubleValue,
            height: height.doubleValue
        )
    }
    return nil
}

func blockingEchoWindowNames(pid: pid_t) -> [String] {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    let rows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    return rows.compactMap { row in
        guard
            let owner = row[kCGWindowOwnerPID as String] as? Int,
            owner == Int(pid),
            let name = row[kCGWindowName as String] as? String,
            !name.isEmpty,
            name != "Recording"
        else {
            return nil
        }
        return name
    }
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

func approximatelyEqual(_ first: CGFloat, _ second: CGFloat) -> Bool {
    abs(first - second) <= 0.5
}

func canvasHasSize(_ bounds: CGRect, _ size: CGSize) -> Bool {
    approximatelyEqual(bounds.width, size.width) &&
        approximatelyEqual(bounds.height, size.height)
}

@discardableResult
func waitForCanvasSize(pid: pid_t, size: CGSize, phase: String) throws -> CGRect {
    let deadline = Date().addingTimeInterval(stateTimeout)
    var lastBounds: CGRect?
    while Date() < deadline {
        if let bounds = recordingBounds(pid: pid) {
            lastBounds = bounds
            if canvasHasSize(bounds, size) {
                return bounds
            }
        }
        usleep(10_000)
    }
    throw SmokeFailure(
        description: "Recording canvas did not reach \(size) during \(phase); last bounds: \(String(describing: lastBounds))"
    )
}

@discardableResult
func requireStableCanvas(pid: pid_t, reference: CGRect, phase: String) throws -> CGRect {
    guard let current = recordingBounds(pid: pid) else {
        throw SmokeFailure(description: "Recording canvas disappeared during \(phase)")
    }
    let stable = approximatelyEqual(current.minX, reference.minX) &&
        approximatelyEqual(current.minY, reference.minY) &&
        approximatelyEqual(current.width, reference.width) &&
        approximatelyEqual(current.height, reference.height)
    try require(stable, "Recording canvas changed during \(phase): \(reference) -> \(current)")
    return current
}

func accessibilityAttribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

func accessibilityElement(_ element: AXUIElement, hasLabel label: String) -> Bool {
    let attributes = [
        kAXTitleAttribute,
        kAXDescriptionAttribute,
        kAXHelpAttribute,
        kAXValueAttribute,
    ]
    for attribute in attributes {
        if accessibilityAttribute(element, attribute) as? String == label {
            return true
        }
    }
    return false
}

func accessibilityChildren(_ element: AXUIElement) -> [AXUIElement] {
    accessibilityAttribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}

func findAccessibleElement(
    root: AXUIElement,
    label: String,
    remainingDepth: Int = 32
) -> AXUIElement? {
    if accessibilityElement(root, hasLabel: label) {
        return root
    }
    guard remainingDepth > 0 else {
        return nil
    }
    for child in accessibilityChildren(root) {
        if let match = findAccessibleElement(
            root: child,
            label: label,
            remainingDepth: remainingDepth - 1
        ) {
            return match
        }
    }
    return nil
}

func waitForAccessibleElement(
    root: AXUIElement,
    label: String,
    timeout: TimeInterval = stateTimeout
) -> AXUIElement? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if let element = findAccessibleElement(root: root, label: label) {
            return element
        }
        usleep(10_000)
    }
    return nil
}


func accessibilityFrame(_ element: AXUIElement) -> CGRect? {
    guard
        let rawPosition = accessibilityAttribute(element, kAXPositionAttribute),
        let rawSize = accessibilityAttribute(element, kAXSizeAttribute),
        CFGetTypeID(rawPosition) == AXValueGetTypeID(),
        CFGetTypeID(rawSize) == AXValueGetTypeID()
    else {
        return nil
    }
    var position = CGPoint.zero
    var size = CGSize.zero
    let positionValue = unsafeBitCast(rawPosition, to: AXValue.self)
    let sizeValue = unsafeBitCast(rawSize, to: AXValue.self)
    guard
        AXValueGetValue(positionValue, .cgPoint, &position),
        AXValueGetValue(sizeValue, .cgSize, &size)
    else {
        return nil
    }
    return CGRect(origin: position, size: size)
}

func waitForAccessibilityWindow(root: AXUIElement, size: CGSize) -> AXUIElement? {
    let deadline = Date().addingTimeInterval(stateTimeout)
    while Date() < deadline {
        let windows =
            accessibilityAttribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
        if let window = windows.first(where: { window in
            guard let frame = accessibilityFrame(window) else {
                return false
            }
            return canvasHasSize(frame, size)
        }) {
            return window
        }
        usleep(10_000)
    }
    return nil
}

func displayBounds(containing point: CGPoint) -> CGRect? {
    var display = CGDirectDisplayID()
    var count: UInt32 = 0
    guard CGGetDisplaysWithPoint(point, 1, &display, &count) == .success, count == 1 else {
        return nil
    }
    return CGDisplayBounds(display)
}


func postMouseMove(_ point: CGPoint) {
    let source = CGEventSource(stateID: .combinedSessionState)
    CGEvent(
        mouseEventSource: source,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    )?.post(tap: .cghidEventTap)
}

func movePointer(_ point: CGPoint) {
    CGWarpMouseCursorPosition(point)
    postMouseMove(point)
}


func click(_ point: CGPoint) throws {
    let source = CGEventSource(stateID: .combinedSessionState)
    guard
        let down = CGEvent(
            mouseEventSource: source,
            mouseType: .leftMouseDown,
            mouseCursorPosition: point,
            mouseButton: .left
        ),
        let up = CGEvent(
            mouseEventSource: source,
            mouseType: .leftMouseUp,
            mouseCursorPosition: point,
            mouseButton: .left
        )
    else {
        throw SmokeFailure(description: "Could not create mouse events")
    }
    movePointer(point)
    usleep(20_000)
    down.post(tap: .cghidEventTap)
    usleep(20_000)
    up.post(tap: .cghidEventTap)
}

func clickAccessibleElement(_ element: AXUIElement, label: String) throws {
    guard let frame = accessibilityFrame(element), !frame.isEmpty else {
        throw SmokeFailure(description: "Could not resolve \(label) accessibility frame")
    }
    let point = CGPoint(x: frame.midX, y: frame.midY)
    movePointer(point)
    usleep(160_000)
    try click(point)
}

func requireForeignFocus(_ pid: pid_t?, phase: String) throws {
    try require(
        NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
        "Echo activated during \(phase)"
    )
}

let previousApplication = NSWorkspace.shared.frontmostApplication
let savedCursor = CGEvent(source: nil)?.location ?? .zero

var exitCode: Int32 = 0
do {
    let echoPid = try echoProcessIdentifier()
    let blockingWindows = blockingEchoWindowNames(pid: echoPid)
    try require(
        blockingWindows.isEmpty,
        "Close Echo windows or permission dialogs before smoke test: \(blockingWindows.joined(separator: ", "))"
    )
    let canvas = try waitForCanvasSize(
        pid: echoPid,
        size: residentCanvasSize,
        phase: "initial resident state"
    )
    guard let display = displayBounds(containing: CGPoint(x: canvas.midX, y: canvas.midY)) else {
        throw SmokeFailure(description: "Could not resolve the resident overlay display")
    }
    let edgeGap = [
        abs(display.maxX - canvas.maxX),
        abs(canvas.minX - display.minX),
        abs(display.maxY - canvas.maxY),
        abs(canvas.minY - display.minY),
    ].min() ?? .infinity
    try require(edgeGap <= 0.5, "Resident canvas is detached from the display edge: \(canvas)")

    if CommandLine.arguments.contains("--geometry-only") {
        print("PASS: resident canvas is attached to a display edge at \(canvas)")
    } else {
        let previousPid = previousApplication?.processIdentifier
        try require(CGPreflightPostEventAccess(), "Synthetic input permission is unavailable")
        try require(AXIsProcessTrusted(), "Accessibility permission is unavailable for this terminal")
        try require(previousPid != nil && previousPid != echoPid, "Focus another app before this smoke test")
    let echoApplicationAccessibility = AXUIElementCreateApplication(echoPid)
    AXUIElementSetMessagingTimeout(echoApplicationAccessibility, Float(stateTimeout))
    guard
        let echoAccessibility = waitForAccessibilityWindow(
            root: echoApplicationAccessibility,
            size: residentCanvasSize
        )
    else {
        throw SmokeFailure(description: "Could not resolve the resident overlay accessibility window")
    }
    CGAssociateMouseAndMouseCursorPosition(boolean_t(0))


    let actionLabels = ["Start recording", "Open Echo chat", "Polish selected text"]
    for label in actionLabels {
        guard
            let action = waitForAccessibleElement(root: echoAccessibility, label: label),
            let frame = accessibilityFrame(action),
            !frame.isEmpty
        else {
            throw SmokeFailure(description: "Could not resolve \(label) action center")
        }
        movePointer(CGPoint(x: frame.midX, y: frame.midY))
        usleep(180_000)
        try require(
            findAccessibleElement(root: echoAccessibility, label: "Open Echo chat") != nil,
            "Resident actions collapsed while dwelling over \(label)"
        )
        try requireStableCanvas(pid: echoPid, reference: canvas, phase: "\(label) dwell")
        try requireForeignFocus(previousPid, phase: "\(label) dwell")
    }

    guard
        let chatAction = findAccessibleElement(root: echoAccessibility, label: "Open Echo chat"),
        let chatFrame = accessibilityFrame(chatAction),
        !chatFrame.isEmpty
    else {
        throw SmokeFailure(description: "Could not resolve Open Echo chat before click")
    }
    let chatPoint = CGPoint(x: chatFrame.midX, y: chatFrame.midY)
    movePointer(chatPoint)
    usleep(180_000)
    try require(
        findAccessibleElement(root: echoAccessibility, label: "Open Echo chat") != nil,
        "Open Echo chat disappeared during the pre-click dwell"
    )
    try requireForeignFocus(previousPid, phase: "Open Echo chat pre-click dwell")
    try click(chatPoint)
    guard let closeChat = waitForAccessibleElement(root: echoAccessibility, label: "Close chat") else {
        throw SmokeFailure(description: "Passive Chat click did not open the React panel")
    }
    try waitForCanvasSize(pid: echoPid, size: chatCanvasSize, phase: "Chat open")
    try requireForeignFocus(previousPid, phase: "passive Chat click")
    try clickAccessibleElement(closeChat, label: "Close chat")
    try waitForCanvasSize(pid: echoPid, size: residentCanvasSize, phase: "Chat close")
    try requireStableCanvas(pid: echoPid, reference: canvas, phase: "Chat close")
    try requireForeignFocus(previousPid, phase: "passive Chat close")
    guard waitForAccessibleElement(root: echoAccessibility, label: "Open Echo chat") != nil else {
        throw SmokeFailure(description: "Resident actions did not recover after Chat closed")
    }
    try requireStableCanvas(pid: echoPid, reference: canvas, phase: "post-Chat resident")
    try requireForeignFocus(previousPid, phase: "post-Chat resident")
    print("PASS: persistent resident actions and passive clicks preserved foreign-app focus")
    }
} catch {
    fputs("FAIL: \(error)\n", stderr)
    exitCode = 1
}

CGWarpMouseCursorPosition(savedCursor)
postMouseMove(savedCursor)
CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
previousApplication?.activate()
if exitCode != 0 {
    exit(exitCode)
}
