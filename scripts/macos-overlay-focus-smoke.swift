import AppKit
import ApplicationServices
import CoreGraphics
import Darwin

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
}

let stateTimeout: TimeInterval = 1.5
/// Echo's own code hands activation back within ~300 ms, so the watch must start at mouse-down.
let clickWatchDuration: TimeInterval = 0.6
let selectedSentence = "Echo keeps this sentence selected."
let documentURL = URL(fileURLWithPath: NSTemporaryDirectory())
    .appendingPathComponent("echo-overlay-focus-smoke.txt")

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() {
        throw SmokeFailure(description: message)
    }
}

func step(_ text: String) {
    print("  \(text)")
}

/// NSWorkspace and NSRunningApplication only refresh while the run loop turns.
func runLoop(for duration: TimeInterval) {
    RunLoop.current.run(until: Date().addingTimeInterval(duration))
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else {
        return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func children(_ element: AXUIElement) -> [AXUIElement] {
    attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}

func windows(_ application: AXUIElement) -> [AXUIElement] {
    attribute(application, kAXWindowsAttribute) as? [AXUIElement] ?? []
}

func hasLabel(_ element: AXUIElement, _ label: String) -> Bool {
    [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXPlaceholderValueAttribute]
        .contains { attribute(element, $0) as? String == label }
}

func findElement(
    in root: AXUIElement,
    depth: Int = 32,
    matching predicate: (AXUIElement) -> Bool
) -> AXUIElement? {
    if predicate(root) {
        return root
    }
    guard depth > 0 else {
        return nil
    }
    for child in children(root) {
        if let match = findElement(in: child, depth: depth - 1, matching: predicate) {
            return match
        }
    }
    return nil
}

func subtreeContains(_ root: AXUIElement, text: String) -> Bool {
    findElement(in: root) { element in
        (attribute(element, kAXValueAttribute) as? String)?.contains(text) == true
    } != nil
}

/// Chat lives in the notification window, the actions in the HUD: every lookup spans all of Echo.
func waitForElement(
    in application: AXUIElement,
    timeout: TimeInterval = stateTimeout,
    matching predicate: (AXUIElement) -> Bool
) -> AXUIElement? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        for window in windows(application) {
            if let match = findElement(in: window, matching: predicate) {
                return match
            }
        }
        runLoop(for: 0.01)
    }
    return nil
}

func frame(of element: AXUIElement) -> CGRect? {
    guard
        let rawPosition = attribute(element, kAXPositionAttribute),
        let rawSize = attribute(element, kAXSizeAttribute),
        CFGetTypeID(rawPosition) == AXValueGetTypeID(),
        CFGetTypeID(rawSize) == AXValueGetTypeID()
    else {
        return nil
    }
    var position = CGPoint.zero
    var size = CGSize.zero
    guard
        AXValueGetValue(unsafeBitCast(rawPosition, to: AXValue.self), .cgPoint, &position),
        AXValueGetValue(unsafeBitCast(rawSize, to: AXValue.self), .cgSize, &size)
    else {
        return nil
    }
    return CGRect(origin: position, size: size)
}

func center(of element: AXUIElement, _ label: String) throws -> CGPoint {
    guard let box = frame(of: element), !box.isEmpty else {
        throw SmokeFailure(description: "Could not resolve the \(label) frame")
    }
    return CGPoint(x: box.midX, y: box.midY)
}

func pid(of element: AXUIElement) -> pid_t? {
    var value: pid_t = 0
    return AXUIElementGetPid(element, &value) == .success ? value : nil
}

/// What Echo's own selection read asks: the app the system routes the keyboard to.
func keyboardOwner() -> pid_t? {
    elementAttribute(AXUIElementCreateSystemWide(), kAXFocusedApplicationAttribute).flatMap(pid(of:))
}

func isActive(_ pid: pid_t) -> Bool {
    NSRunningApplication(processIdentifier: pid)?.isActive == true
}

func postMouse(_ type: CGEventType, at point: CGPoint) {
    CGEvent(
        mouseEventSource: CGEventSource(stateID: .combinedSessionState),
        mouseType: type,
        mouseCursorPosition: point,
        mouseButton: .left
    )?.post(tap: .cghidEventTap)
}

func movePointer(to point: CGPoint) {
    CGWarpMouseCursorPosition(point)
    postMouse(.mouseMoved, at: point)
}

func type(_ text: String) {
    let source = CGEventSource(stateID: .combinedSessionState)
    for unit in text.utf16 {
        for isDown in [true, false] {
            var character = unit
            let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: isDown)
            event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &character)
            event?.post(tap: .cghidEventTap)
            runLoop(for: 0.01)
        }
    }
}

struct ForeignDocument {
    let pid: pid_t
    let textArea: AXUIElement

    var selectedText: String? {
        attribute(textArea, kAXSelectedTextAttribute) as? String
    }
}

/// A click, like the user's own, is the only thing that takes the keyboard back from a floating panel.
func openForeignDocument() throws -> ForeignDocument {
    try selectedSentence.write(to: documentURL, atomically: true, encoding: .utf8)
    let open = Process()
    open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    open.arguments = ["-a", "TextEdit", documentURL.path]
    try open.run()
    open.waitUntilExit()
    let deadline = Date().addingTimeInterval(5)
    while Date() < deadline {
        runLoop(for: 0.05)
        guard
            let textEdit = NSWorkspace.shared.runningApplications.first(where: {
                $0.bundleIdentifier == "com.apple.TextEdit"
            }),
            let textArea = elementAttribute(
                AXUIElementCreateApplication(textEdit.processIdentifier),
                kAXFocusedUIElementAttribute
            ),
            attribute(textArea, kAXValueAttribute) as? String == selectedSentence,
            let box = frame(of: textArea)
        else {
            continue
        }
        if keyboardOwner() != textEdit.processIdentifier {
            let point = CGPoint(x: box.midX, y: box.midY)
            movePointer(to: point)
            postMouse(.leftMouseDown, at: point)
            postMouse(.leftMouseUp, at: point)
            runLoop(for: 0.25)
            continue
        }
        return ForeignDocument(pid: textEdit.processIdentifier, textArea: textArea)
    }
    throw SmokeFailure(description: "TextEdit did not take the keyboard with the smoke document")
}

func selectSentence(in document: ForeignDocument) throws {
    var range = CFRange(location: 0, length: selectedSentence.utf16.count)
    guard let value = AXValueCreate(.cfRange, &range) else {
        throw SmokeFailure(description: "Could not build the selection range")
    }
    AXUIElementSetAttributeValue(document.textArea, kAXSelectedTextRangeAttribute as CFString, value)
    runLoop(for: 0.1)
    try require(document.selectedText == selectedSentence, "TextEdit did not select the smoke sentence")
}

func closeForeignDocument(_ document: ForeignDocument) {
    let textEdit = AXUIElementCreateApplication(document.pid)
    for window in windows(textEdit) where (attribute(window, kAXDocumentAttribute) as? String)?
        .hasSuffix(documentURL.lastPathComponent) == true {
        if let close = elementAttribute(window, kAXCloseButtonAttribute) {
            AXUIElementPerformAction(close, kAXPressAction as CFString)
        }
    }
}

struct SmokeSession {
    let echo: AXUIElement
    let echoPid: pid_t
    let document: ForeignDocument

    func requireFocusStays(keyboardMayMove: Bool, _ phase: String) throws {
        try require(!isActive(echoPid), "Echo activated during \(phase), deactivating the user's app")
        try require(isActive(document.pid), "TextEdit stopped being the active app during \(phase)")
        if !keyboardMayMove {
            try require(keyboardOwner() == document.pid, "Echo took the keyboard during \(phase)")
        }
    }

    func watchFocus(for duration: TimeInterval, keyboardMayMove: Bool, _ phase: String) throws {
        let deadline = Date().addingTimeInterval(duration)
        repeat {
            try requireFocusStays(keyboardMayMove: keyboardMayMove, phase)
            runLoop(for: 0.005)
        } while Date() < deadline
    }

    /// Samples focus from mouse-down on: activation Echo undoes a moment later still costs the selection read.
    func click(_ point: CGPoint, keyboardMayMove: Bool, _ phase: String) throws {
        movePointer(to: point)
        runLoop(for: 0.18)
        postMouse(.leftMouseDown, at: point)
        try watchFocus(for: 0.03, keyboardMayMove: keyboardMayMove, phase)
        postMouse(.leftMouseUp, at: point)
        try watchFocus(for: clickWatchDuration, keyboardMayMove: keyboardMayMove, phase)
        try require(document.selectedText == selectedSentence, "TextEdit lost its selection during \(phase)")
    }

    func element(_ label: String, timeout: TimeInterval = stateTimeout) throws -> AXUIElement {
        guard let match = waitForElement(in: echo, timeout: timeout, matching: { hasLabel($0, label) }) else {
            throw SmokeFailure(description: "Echo shows no \(label)")
        }
        return match
    }

    /// Hover reveals the actions without ever taking the keyboard; the accessibility tree lists them before the reveal lands.
    func revealAction(_ label: String) throws -> CGPoint {
        let resident = try residentWindow(echo)
        movePointer(to: try center(of: resident, "resident island"))
        try watchFocus(for: 0.8, keyboardMayMove: false, "island hover")
        let point = try center(of: try element(label), label)
        movePointer(to: point)
        try watchFocus(for: 0.3, keyboardMayMove: false, "\(label) dwell")
        try require(
            findElement(in: resident, matching: { hasLabel($0, label) }) != nil,
            "Resident actions collapsed while dwelling over \(label)"
        )
        return point
    }

    func waitForKeyboardReturn(_ phase: String) throws {
        let deadline = Date().addingTimeInterval(stateTimeout)
        while keyboardOwner() != document.pid, Date() < deadline {
            runLoop(for: 0.01)
        }
        try require(keyboardOwner() == document.pid, "\(phase) left the keyboard stranded away from TextEdit")
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

/// Title, not size: the island's canvas changes with the screen edge it docks to.
func residentWindow(_ echo: AXUIElement) throws -> AXUIElement {
    let resident = windows(echo).first { attribute($0, kAXTitleAttribute) as? String == "Recording" }
    guard let resident else {
        throw SmokeFailure(description: "Could not find the resident island")
    }
    return resident
}

func chatScenario(_ session: SmokeSession) throws {
    print("Scenario: asking chat about the text selected in another app")
    step("When the user opens chat from the island")
    try session.click(try session.revealAction("Open Echo chat"), keyboardMayMove: true, "opening chat")
    step("Then chat quotes the sentence TextEdit still holds selected")
    let quotesSentence = waitForElement(in: session.echo, timeout: 4) { element in
        hasLabel(element, "Selected text context") && subtreeContains(element, text: selectedSentence)
    }
    try require(quotesSentence != nil, "Chat did not attach the sentence selected in TextEdit")
    step("When the user clicks into the composer and types")
    let composer = try session.element("Ask about this text")
    try session.click(try center(of: composer, "composer"), keyboardMayMove: true, "clicking the composer")
    type("hi")
    step("Then the keystrokes reach the composer while TextEdit stays active and selected")
    try session.watchFocus(for: 0.2, keyboardMayMove: true, "typing in chat")
    try require(attribute(composer, kAXValueAttribute) as? String == "hi", "Typing did not reach the chat composer")
    try require(session.document.selectedText == selectedSentence, "TextEdit lost its selection while chat was typed into")
    step("When the user closes chat, the keyboard returns to TextEdit")
    let close = try session.element("Close chat")
    try session.click(try center(of: close, "Close chat"), keyboardMayMove: true, "closing chat")
    try session.waitForKeyboardReturn("Closing chat")
}

func polishScenario(_ session: SmokeSession) throws {
    print("Scenario: polishing the text selected in another app")
    try selectSentence(in: session.document)
    step("When the user clicks Polish on the island")
    let polish = try session.revealAction("Polish selected text")
    step("Then TextEdit keeps the keyboard and its selection for Polish to read")
    try session.click(polish, keyboardMayMove: false, "clicking Polish")
}

let previousApplication = NSWorkspace.shared.frontmostApplication
let savedCursor = CGEvent(source: nil)?.location ?? .zero
var openedDocument: ForeignDocument?
var echoApplication: AXUIElement?
var exitCode: Int32 = 0

do {
    try require(CGPreflightPostEventAccess(), "Synthetic input permission is unavailable")
    try require(AXIsProcessTrusted(), "Accessibility permission is unavailable for this terminal")
    let echoPid = try echoProcessIdentifier()
    let echo = AXUIElementCreateApplication(echoPid)
    echoApplication = echo
    AXUIElementSetMessagingTimeout(echo, Float(stateTimeout))
    print("Given TextEdit is the active app with \"\(selectedSentence)\" selected")
    let document = try openForeignDocument()
    openedDocument = document
    try selectSentence(in: document)
    CGAssociateMouseAndMouseCursorPosition(boolean_t(0))
    let session = SmokeSession(echo: echo, echoPid: echoPid, document: document)
    try chatScenario(session)
    try polishScenario(session)
    print("PASS: clicking Echo left the user's app active with its selection intact")
} catch {
    fputs("FAIL: \(error)\n", stderr)
    exitCode = 1
}

CGWarpMouseCursorPosition(savedCursor)
postMouse(.mouseMoved, at: savedCursor)
CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
runLoop(for: 1)
if let openedDocument {
    closeForeignDocument(openedDocument)
}
if let echoApplication, let close = findElement(in: echoApplication, matching: { hasLabel($0, "Close chat") }) {
    AXUIElementPerformAction(close, kAXPressAction as CFString)
}
previousApplication?.activate()
exit(exitCode)
