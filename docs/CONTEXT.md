# Jev → v0 cost-savings demo

A proof-of-concept showing that prompt-based model routing (Jev classifying
each v0 chat once, then locking a model) reduces v0 Platform API spend
compared to running everything on the status-quo model.

## Language

**Replay**:
A simulation of a routing policy over the historical usage export, estimating what those chats would have cost under that policy.
_Avoid_: backtest, simulation run

**Baseline**:
The actual spend recorded in the usage export — what the customer really paid with no routing policy applied.
_Avoid_: actual cost, status quo (as nouns)

**Projected savings**:
Baseline minus replay cost for a given policy. Always labeled "projected"; never presented as measured live savings.
_Avoid_: savings (unqualified), ROI

**Routing visualizer**:
The animated SVG diagram that shows the life of a request: pipeline stages light up as they fire, and selecting a stage shows its structured input/output (Jev's answers with confidence, the policy rule fired, the locked model) in an inspector panel. Runs in live mode (one chat) or replay mode (the usage export).
_Avoid_: decision panel, classifier output

**Locked model**:
The model fixed to a chat at creation and reused for every follow-up; switching mid-chat is not allowed because it breaks prompt caching.
_Avoid_: active model, current model
