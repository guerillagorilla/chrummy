```mermaid
sequenceDiagram
    participant Engine as Rummy Engine
    participant AI as Built-in AI
    participant LLM as AI Strategy Layer

    Engine->>AI: Generate legal candidate moves
    AI-->>Engine: Candidates + heuristic labels
    Engine->>LLM: Strategy request (JSON contract)
    LLM-->>Engine: Vetoes + weight adjustments
    Engine->>Engine: Re-score candidates
    Engine->>Engine: Select best legal move


