import Foundation
import Network

public struct WireCommand: Equatable {
  public var confidence: Double
  public var id: String
  public var level: Int?
  public var name: String
  public var transcript: String

  public init(id: String, name: String, level: Int?, transcript: String, confidence: Double) {
    self.confidence = confidence
    self.id = id
    self.level = level
    self.name = name
    self.transcript = transcript
  }

  public init(id: String, command: PlayerCommand, transcript: String, confidence: Double) {
    self.init(
      id: id,
      name: command.wireName,
      level: command.level,
      transcript: transcript,
      confidence: confidence
    )
  }

  func jsonObject() -> [String: Any] {
    var object: [String: Any] = [
      "confidence": confidence,
      "id": id,
      "name": name,
      "transcript": transcript,
    ]
    if let level {
      object["level"] = level
    }
    return object
  }
}

public final class CommandServer {
  public static let defaultPort: UInt16 = 47631

  public var onNeedsBrowser: () -> Void = {}
  public var onResult: (_ id: String, _ ok: Bool) -> Void = { _, _ in }

  private let port: UInt16
  private let deliveryTimeout: TimeInterval
  private let pollTimeout: TimeInterval
  private let liveWindow: TimeInterval
  private let queue = DispatchQueue(label: "ymv.command-server")

  private var listener: NWListener?
  private var clients: [String: Client] = [:]
  private var pending: [Pending] = []
  private var delivered: [String: String] = [:]
  private var askedForBrowser = false
  private var readyHandler: ((Error?) -> Void)?

  public init(
    port: UInt16 = CommandServer.defaultPort,
    deliveryTimeout: TimeInterval = 20,
    pollTimeout: TimeInterval = 20,
    liveWindow: TimeInterval = 8
  ) {
    self.deliveryTimeout = deliveryTimeout
    self.liveWindow = liveWindow
    self.pollTimeout = pollTimeout
    self.port = port
  }

  public func start() throws {
    let parameters = NWParameters.tcp
    parameters.allowLocalEndpointReuse = true
    parameters.requiredLocalEndpoint = .hostPort(
      host: .ipv4(IPv4Address("127.0.0.1")!),
      port: NWEndpoint.Port(rawValue: port)!
    )

    let listener = try NWListener(using: parameters)
    self.listener = listener

    listener.newConnectionHandler = { [weak self] connection in
      self?.accept(connection)
    }
    listener.stateUpdateHandler = { [weak self] state in
      self?.observe(state)
    }

    let ready = DispatchSemaphore(value: 0)
    var startError: Error?
    readyHandler = { error in
      startError = error
      ready.signal()
    }

    listener.start(queue: queue)
    if ready.wait(timeout: .now() + 2) == .timedOut {
      throw CommandServerError.bindTimeout
    }
    if let startError {
      throw startError
    }
  }

  public func stop() {
    queue.sync {
      listener?.cancel()
      listener = nil
      for client in clients.values {
        client.waiter?.finish(status: 200, object: [:])
      }
      clients.removeAll()
      failPending()
      askedForBrowser = false
    }
  }

  public func submit(_ command: WireCommand, completion: @escaping (Bool) -> Void) {
    queue.async {
      self.sweep()
      if let clientId = self.bestWaiter() {
        self.deliver(command, to: clientId, completion: completion)
        return
      }

      let pending = Pending(command: command, completion: completion)
      pending.timer = self.makeTimer(after: self.deliveryTimeout) { [weak self] in
        self?.expire(pending)
      }
      self.pending.append(pending)

      if !self.hasLiveClient() {
        self.askForBrowser()
      }
    }
  }

  private func observe(_ state: NWListener.State) {
    switch state {
    case .ready:
      readyHandler?(nil)
      readyHandler = nil
    case .failed(let error):
      readyHandler?(error)
      readyHandler = nil
    default:
      break
    }
  }

  private func accept(_ connection: NWConnection) {
    connection.stateUpdateHandler = { [weak self] state in
      if case .failed = state {
        self?.dropWaiter(connection)
      }
      if case .cancelled = state {
        self?.dropWaiter(connection)
      }
    }
    connection.start(queue: queue)
    read(connection, buffer: Data()) { [weak self] request in
      guard let self else { return }
      guard let request else {
        self.respond(connection, status: 400, object: ["error": "bad request"])
        return
      }
      self.route(request, connection: connection)
    }
  }

  private func read(
    _ connection: NWConnection,
    buffer: Data,
    completion: @escaping (HTTPRequest?) -> Void
  ) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
      guard let self else {
        completion(nil)
        return
      }

      var buffer = buffer
      if let data {
        buffer.append(data)
      }

      if let request = HTTPRequest.parse(buffer) {
        completion(request)
        return
      }

      if isComplete || error != nil || buffer.count > 1_000_000 {
        completion(nil)
        return
      }

      self.read(connection, buffer: buffer, completion: completion)
    }
  }

  private func route(_ request: HTTPRequest, connection: NWConnection) {
    switch (request.method, request.path) {
    case ("POST", "/v1/session"):
      postSession(request, connection: connection)
    case ("GET", "/v1/wait"):
      getWait(request, connection: connection)
    case ("POST", "/v1/result"):
      postResult(request, connection: connection)
    default:
      respond(connection, status: 404, object: ["error": "not found"])
    }
  }

  private func postSession(_ request: HTTPRequest, connection: NWConnection) {
    guard let body = request.jsonObject() else {
      respond(connection, status: 400, object: ["error": "bad json"])
      return
    }

    let href = body["href"] as? String ?? ""
    let visibility = body["visibility"] as? String == "visible" ? "visible" : "hidden"
    let hasPlayer = body["hasPlayer"] as? Bool ?? false
    let playing = body["playing"] as? Bool ?? false
    let incomingId = body["clientId"] as? String ?? ""

    let client: Client
    if let existing = clients[incomingId] {
      existing.href = href
      existing.visibility = visibility
      existing.hasPlayer = hasPlayer
      existing.playing = playing
      existing.lastSeen = Date()
      client = existing
    }
    else {
      client = Client(
        id: UUID().uuidString,
        href: href,
        visibility: visibility,
        hasPlayer: hasPlayer,
        playing: playing
      )
      clients[client.id] = client
      askedForBrowser = false
    }

    respond(connection, status: 200, object: ["clientId": client.id])
  }

  private func getWait(_ request: HTTPRequest, connection: NWConnection) {
    guard let clientId = request.query["clientId"], let client = clients[clientId] else {
      respond(connection, status: 404, object: ["error": "unknown client"])
      return
    }

    client.lastSeen = Date()
    client.waiter?.finish(status: 200, object: [:])

    let waiter = Waiter(connection: connection)
    waiter.timer = makeTimer(after: pollTimeout) { [weak self] in
      self?.finishWait(clientId: clientId, object: [:])
    }
    client.waiter = waiter
    flushPending()
  }

  private func postResult(_ request: HTTPRequest, connection: NWConnection) {
    guard let body = request.jsonObject() else {
      respond(connection, status: 400, object: ["error": "bad json"])
      return
    }

    let id = body["id"] as? String ?? ""
    let ok = body["ok"] as? Bool ?? false
    if let clientId = body["clientId"] as? String, clients[clientId] != nil {
      clients[clientId]?.lastSeen = Date()
    }

    if !id.isEmpty {
      let name = delivered[id] ?? id
      delivered[id] = nil
      onResult(name, ok)
    }

    respond(connection, status: 200, object: ["ok": true])
  }

  private func flushPending() {
    guard let command = pending.first, let clientId = bestWaiter() else { return }
    let item = pending.removeFirst()
    item.timer?.cancel()
    deliver(command.command, to: clientId, completion: item.completion)
  }

  private func deliver(_ command: WireCommand, to clientId: String, completion: @escaping (Bool) -> Void) {
    guard let client = clients[clientId], let waiter = client.waiter else {
      completion(false)
      return
    }

    client.lastSeen = Date()
    client.waiter = nil
    delivered[command.id] = command.name
    waiter.finish(status: 200, object: command.jsonObject())
    completion(true)
  }

  private func expire(_ item: Pending) {
    guard let index = pending.firstIndex(where: { $0 === item }) else { return }
    pending.remove(at: index)
    if pending.isEmpty {
      askedForBrowser = false
    }
    item.completion(false)
  }

  private func finishWait(clientId: String, object: [String: Any]) {
    guard let waiter = clients[clientId]?.waiter else { return }
    clients[clientId]?.waiter = nil
    clients[clientId]?.lastSeen = Date()
    waiter.finish(status: 200, object: object)
  }

  private func failPending() {
    let items = pending
    pending.removeAll()
    for item in items {
      item.timer?.cancel()
      item.completion(false)
    }
  }

  private func askForBrowser() {
    guard !askedForBrowser else { return }
    askedForBrowser = true
    DispatchQueue.main.async {
      self.onNeedsBrowser()
    }
  }

  private func hasLiveClient() -> Bool {
    clients.values.contains { client in
      client.waiter != nil || Date().timeIntervalSince(client.lastSeen) < liveWindow
    }
  }

  private func bestWaiter() -> String? {
    let waiting = clients.values.filter { $0.waiter != nil }
    return waiting.max(by: { $0.rank < $1.rank })?.id
  }

  private func dropWaiter(_ connection: NWConnection) {
    for client in clients.values {
      guard client.waiter?.connection === connection else { continue }
      client.waiter?.timer?.cancel()
      client.waiter = nil
      client.lastSeen = Date()
    }
  }

  private func sweep() {
    let now = Date()
    clients = clients.filter { _, client in
      client.waiter != nil || now.timeIntervalSince(client.lastSeen) < 60
    }
  }

  private func makeTimer(after interval: TimeInterval, handler: @escaping () -> Void) -> DispatchSourceTimer {
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + interval)
    timer.setEventHandler(handler: handler)
    timer.resume()
    return timer
  }

  private func respond(_ connection: NWConnection, status: Int, object: [String: Any]) {
    connection.send(content: httpData(status: status, object: object), completion: .contentProcessed { _ in
      connection.cancel()
    })
  }
}

private final class Client {
  var hasPlayer: Bool
  var href: String
  var id: String
  var lastSeen = Date()
  var playing: Bool
  var visibility: String
  var waiter: Waiter?

  init(id: String, href: String, visibility: String, hasPlayer: Bool, playing: Bool) {
    self.hasPlayer = hasPlayer
    self.href = href
    self.id = id
    self.playing = playing
    self.visibility = visibility
  }

  var rank: (Int, Int, TimeInterval) {
    let presence: Int
    if visibility == "visible", hasPlayer {
      presence = 2
    }
    else if hasPlayer {
      presence = 1
    }
    else {
      presence = 0
    }
    return (presence, playing ? 1 : 0, lastSeen.timeIntervalSince1970)
  }
}

private final class Pending {
  var command: WireCommand
  var completion: (Bool) -> Void
  var timer: DispatchSourceTimer?

  init(command: WireCommand, completion: @escaping (Bool) -> Void) {
    self.command = command
    self.completion = completion
  }
}

private final class Waiter {
  var connection: NWConnection
  var timer: DispatchSourceTimer?

  init(connection: NWConnection) {
    self.connection = connection
  }

  func finish(status: Int, object: [String: Any]) {
    timer?.cancel()
    timer = nil
    let payload = httpData(status: status, object: object)
    connection.send(content: payload, completion: .contentProcessed { [connection] _ in
      connection.cancel()
    })
  }
}

private struct HTTPRequest {
  var body: Data
  var method: String
  var path: String
  var query: [String: String]

  static func parse(_ data: Data) -> HTTPRequest? {
    let separator = Data("\r\n\r\n".utf8)
    guard let headerEnd = data.range(of: separator) else { return nil }
    let head = data.subdata(in: 0..<headerEnd.lowerBound)
    guard let text = String(data: head, encoding: .utf8) else { return nil }

    var lines = text.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else { return nil }
    lines.removeFirst()

    let parts = requestLine.split(separator: " ")
    guard parts.count >= 2 else { return nil }

    var headers: [String: String] = [:]
    for line in lines {
      guard let colon = line.firstIndex(of: ":") else { continue }
      let key = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
      let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      headers[key] = value
    }

    let length = Int(headers["content-length"] ?? "") ?? 0
    let bodyStart = headerEnd.upperBound
    guard data.count >= bodyStart + length else { return nil }
    let body = data.subdata(in: bodyStart..<(bodyStart + length))

    let target = String(parts[1])
    let split = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
    let path = String(split[0])
    var query: [String: String] = [:]
    if split.count == 2 {
      for pair in split[1].split(separator: "&") where !pair.isEmpty {
        let item = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        let key = String(item[0])
        let raw = item.count == 2 ? String(item[1]) : ""
        query[key] = raw.removingPercentEncoding ?? raw
      }
    }

    return HTTPRequest(body: body, method: String(parts[0]), path: path, query: query)
  }

  func jsonObject() -> [String: Any]? {
    guard !body.isEmpty else { return [:] }
    return (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
  }
}

private func httpData(status: Int, object: [String: Any]) -> Data {
  let reason: String
  switch status {
  case 200: reason = "OK"
  case 400: reason = "Bad Request"
  default: reason = "Not Found"
  }

  let body = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
  let header = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
  var data = Data(header.utf8)
  data.append(body)
  return data
}

public enum CommandServerError: Error {
  case bindTimeout
}
