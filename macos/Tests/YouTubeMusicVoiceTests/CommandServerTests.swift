import XCTest
@testable import YouTubeMusicVoiceCore

final class CommandServerTests: XCTestCase {
  func testWaitingClientReceivesCommand() throws {
    let port = UInt16(47_211)
    let server = CommandServer(port: port, deliveryTimeout: 1, pollTimeout: 2)
    try server.start()
    defer { server.stop() }

    let clientId = try postSession(port: port)
    let delivered = expectation(description: "delivered")
    let received = expectation(description: "received")
    var payload: [String: Any] = [:]

    var waitRequest = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/v1/wait?clientId=\(clientId)")!)
    waitRequest.timeoutInterval = 3
    URLSession.shared.dataTask(with: waitRequest) { data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      XCTAssertEqual(status, 200)
      payload = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [String: Any] ?? [:]
      received.fulfill()
    }.resume()

    let command = WireCommand(id: "cmd-1", name: "pause", level: nil, transcript: "пауза", confidence: 1)
    server.submit(command) { ok in
      if ok { delivered.fulfill() }
    }

    wait(for: [delivered, received], timeout: 3)
    XCTAssertEqual(payload["name"] as? String, "pause")
    XCTAssertEqual(payload["id"] as? String, "cmd-1")
  }

  func testUnknownClientIsRejected() throws {
    let port = UInt16(47_212)
    let server = CommandServer(port: port, deliveryTimeout: 0.5, pollTimeout: 0.5)
    try server.start()
    defer { server.stop() }

    let response = try request(
      url: URL(string: "http://127.0.0.1:\(port)/v1/wait?clientId=missing")!,
      method: "GET",
      body: nil,
      timeout: 2
    )
    XCTAssertEqual(response.status, 404)
  }

  func testNoClientAsksToOpenTheBrowser() throws {
    let port = UInt16(47_213)
    let server = CommandServer(port: port, deliveryTimeout: 0.4, pollTimeout: 0.4)
    let asked = expectation(description: "open browser")
    let dropped = expectation(description: "not delivered")
    server.onNeedsBrowser = { asked.fulfill() }
    try server.start()
    defer { server.stop() }

    let command = WireCommand(id: "cmd-2", name: "play", level: nil, transcript: "включи музыку", confidence: 1)
    server.submit(command) { ok in
      if !ok { dropped.fulfill() }
    }

    wait(for: [asked, dropped], timeout: 2)
  }

  private func postSession(port: UInt16) throws -> String {
    let body: [String: Any] = [
      "hasPlayer": true,
      "href": "https://music.youtube.com/watch?v=test",
      "playing": true,
      "visibility": "visible",
    ]
    let response = try request(
      url: URL(string: "http://127.0.0.1:\(port)/v1/session")!,
      method: "POST",
      body: try JSONSerialization.data(withJSONObject: body),
      timeout: 2
    )
    XCTAssertEqual(response.status, 200)
    let json = try JSONSerialization.jsonObject(with: response.body) as? [String: Any]
    let clientId = json?["clientId"] as? String
    return try XCTUnwrap(clientId)
  }

  private func request(url: URL, method: String, body: Data?, timeout: TimeInterval) throws -> (status: Int, body: Data) {
    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = method
    urlRequest.timeoutInterval = timeout
    if let body {
      urlRequest.httpBody = body
      urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    let done = expectation(description: url.path)
    var status = 0
    var data = Data()
    var failure: Error?
    URLSession.shared.dataTask(with: urlRequest) { responseData, response, error in
      status = (response as? HTTPURLResponse)?.statusCode ?? 0
      data = responseData ?? Data()
      failure = error
      done.fulfill()
    }.resume()
    wait(for: [done], timeout: timeout + 1)
    if let failure { throw failure }
    return (status, data)
  }
}
