# Role-Based Dynamic Bayesian Network (RB-DBN) for VDSAgents

## 1. Introduction
This document models the VDSAgents multi-agent system as a **Role-Based Dynamic Bayesian Network (RB-DBN)**. Unlike traditional multi-agent models that bind actions to specific static agents, this system utilizes **Role Ports**.

### The "Role Port" Concept
In this architecture, "Planner", "Worker", and "Reflector" are not fixed agent instances, but **Role Classes** (or Ports).
*   **Role ($R_t$)**: A dynamic functional interface selected based on the system state.
*   **Action ($A_t$)**: An operation belonging to the active Role's action space, not a specific agent's identity.

The system dynamically schedules a "Role" to handle the current context, effectively decoupling the *what* (Action) from the *who* (Agent Instance).

## 2. Network Nodes (Variables)

The causal flow for a single time step $t$ is:
$$ S_t \rightarrow O_t \rightarrow R_t \rightarrow A_t \rightarrow S_{t+1} $$

### 2.1. System State Nodes ($S_t$)
The composite state of the data science lifecycle.
- **$S_t \in \mathcal{S}$**: The state space.
- **Components**:
    - `FSM_State`: $\{ \text{IDLE}, \text{STAGE_RUNNING}, \text{STEP_RUNNING}, \text{BEHAVIOR_RUNNING}, \text{BEHAVIOR_COMPLETED}, \text{STEP_COMPLETED}, \text{STAGE_COMPLETED} \}$
    - `Location`: $\{ \text{StageID}, \text{StepID}, \text{BehaviorID}, \text{Iteration}, \text{Progress} \}$
    - `Context`: $\{ \text{Variables}, \text{NotebookContent}, \text{ExecutionEffects}, \text{Artifacts} \}$

### 2.2. Observation Nodes ($O_t$)
A structured projection of the state available to the active role.
- **$O_t = f(S_t)$**: Deterministic projection.
- **Features**: $O_{err}$ (Errors), $O_{goal}$ (Goal Status), $O_{art}$ (Artifacts).

### 2.3. Role Selection Node ($R_t$) [NEW]
The decision variable determining which **Role Port** is active for the current time step.
- **$R_t \in \mathcal{R}$**: The role space.
- **Values**:
    - $\text{PlannerRole}$: Responsible for structural decomposition.
    - $\text{WorkerRole}$: Responsible for code/text generation.
    - $\text{ReflectorRole}$: Responsible for evaluation and correction.

### 2.4. Action Nodes ($A_t$)
The specific operation executed, drawn from the **Action Space** of the selected Role $R_t$.

- **If $R_t = \text{PlannerRole}$**: $A_t \in \mathcal{A}_{plan}$
    - `PlanStage`, `PlanStep`, `DelegateTask`, `CompletePlanning`
- **If $R_t = \text{WorkerRole}$**: $A_t \in \mathcal{A}_{work}$
    - `ExecCode`, `AddText`, `CommentResult`
- **If $R_t = \text{ReflectorRole}$**: $A_t \in \mathcal{A}_{ref}$
    - `BugAnalysis`, `UpdateCode`, `ExecNewVersion`, `CompleteReflection`

## 3. Probabilistic Dependencies (CPDs)

### 3.1. Role Selection Model ($P(R_t | S_t, O_t)$)
The system deterministically or probabilistically selects the active role based on the FSM state.

$$
P(R_t | S_t) \approx
\begin{cases}
\text{PlannerRole} & \text{if } S_t \in \{\text{IDLE}, \text{STAGE\_RUNNING}, \text{STEP\_RUNNING}\} \\
\text{WorkerRole} & \text{if } S_t = \text{BEHAVIOR\_RUNNING} \\
\text{ReflectorRole} & \text{if } S_t = \text{BEHAVIOR\_COMPLETED}
\end{cases}
$$

### 3.2. Action Generation Model ($P(A_t | R_t, O_t)$)
Actions are generated conditionally on the **Role** and **Observation**.

#### Case A: Worker Role ($R_t = \text{WorkerRole}$)
$$
P(A_t | \text{WorkerRole}, O_{task}) = \text{LLM}_{\text{Worker}}(O_{task})
$$
*   High probability of `ExecCode` for calculation tasks.
*   High probability of `AddText` for explanation tasks.

#### Case B: Reflector Role ($R_t = \text{ReflectorRole}$)
$$
P(A_t | \text{ReflectorRole}, O_{err}) \approx
\begin{cases}
P(A_{fix}) \approx 1 & \text{if } O_{err} = \text{True} \\
P(A_{complete}) \approx 1 & \text{if } O_{err} = \text{False}
\end{cases}
$$

### 3.3. State Transition Model ($P(S_{t+1} | S_t, A_t)$)
Transitions are driven by the executed action.

$$
S_{t+1} = T(S_t, A_t)
$$

*   $T(..., A_{complete}) \rightarrow \text{BEHAVIOR\_RUNNING}$ (Loop) or $\text{STEP\_COMPLETED}$
*   $T(..., A_{retry}) \rightarrow \text{BEHAVIOR\_COMPLETED}$ (Self-loop for re-evaluation)

## 4. Graphical Model

### 4.1. Causal Flow (Mermaid)

```mermaid
graph TD
    subgraph Time t
    S_t[State S_t] --> O_t[Observation O_t]
    O_t --> R_t{Role Selection R_t}
    
    R_t -- "Planner" --> A_plan[Action Space: Planner]
    R_t -- "Worker" --> A_work[Action Space: Worker]
    R_t -- "Reflector" --> A_ref[Action Space: Reflector]
    
    A_plan --> A_t((Action A_t))
    A_work --> A_t
    A_ref --> A_t
    
    A_t --> S_next[State S_{t+1}]
    end
    
    style R_t fill:#f9f,stroke:#333,stroke-width:2px
    style A_t fill:#ff9,stroke:#333,stroke-width:2px
```

### 4.2. Plate Notation (LaTeX Representation)
For academic representation, the RB-DBN can be described as:

$$
P(S_{0:T}, O_{0:T}, R_{0:T}, A_{0:T}) = P(S_0) \prod_{t=0}^{T-1} P(O_t|S_t) P(R_t|S_t, O_t) P(A_t|R_t, O_t) P(S_{t+1}|S_t, A_t)
$$

Where:
*   $R_t$ acts as a **Switching Variable** (or Multiplexer) that determines the conditional distribution of $A_t$.

## 5. Key Insights of Role-Based Modeling
1.  **Dynamic Dispatch**: The system doesn't "have" 3 agents waiting. It "instantiates" a role behavior on demand.
2.  **Contextual Action Space**: The valid actions $A_t$ are constrained strictly by $R_t$. A Worker *cannot* mark a step complete; only a Reflector can.
3.  **Scalability**: New roles (e.g., "Reviewer", "Optimizer") can be added simply by expanding the domain of $R_t$ and defining $\mathcal{A}_{new}$, without changing the core DBN structure.
