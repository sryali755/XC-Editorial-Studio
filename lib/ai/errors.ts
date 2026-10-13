export class AgentError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "agent_error",
    public retryable = false,
  ) {
    super(message);
  }
}
