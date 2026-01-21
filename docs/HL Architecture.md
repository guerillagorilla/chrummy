```mermaid
flowchart LR
    subgraph RE1["rummy-engine (deterministic)"]
        GS["Game State"]
        RULES["Rules Engine"]
        AI0["Built-in AI<br/>(rules + heuristics)"]
        MOVESEL["Final Move Selector"]
    end

    subgraph RE2["ai-strategy-layer (LLM)"]
        PROMPT["Strategy Prompt Builder"]
        LLM["llama 3.1 / Codex"]
        STRAT["Strategy Response<br/>(veto / weights / flags)"]
    end

    GS --> RULES
    RULES --> AI0
    AI0 -->|candidate moves + heuristic labels| PROMPT 
    PROMPT --> LLM
    LLM --> STRAT
    STRAT -->|veto + weight adjustments| MOVESEL
    AI0 -->|fallback if AI disabled| MOVESEL
    MOVESEL -->|chosen move| GS
