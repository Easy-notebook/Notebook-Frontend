# app.py
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# 定义各个清洗阶段的基本信息
CLEANING_STEPS = [
    {
        "id": "data-cleaning-step0",
        "stepId": "data-cleaning-step0-step",
        "title": "Stage Introduction"
    },
    {
        "id": "data-cleaning-step1",
        "stepId": "data-cleaning-step1-step",
        "title": "Review Background Information"
    },
    {
        "id": "data-cleaning-step2",
        "stepId": "data-cleaning-step2-step",
        "title": "Load Data"
    },
    {
        "id": "data-cleaning-step3",
        "stepId": "data-cleaning-step3-step",
        "title": "Examine the Data"
    },
    {
        "id": "data-cleaning-step4",
        "stepId": "data-cleaning-step4-step",
        "title": "Clean and Pre-process"
    }
]

# 定义步骤操作内容（此处只展示部分步骤，其他步骤请参照原有代码）
STEP_CONTENTS = [
    # ---------------------- STEP 0 ----------------------
    [
        {
            "action": "add",
            "shotType": "dialogue",
            "content": "## Data cleaning and pre-processing",
            "metadata": {
                "icon": "FileText",
                "hideRemoveButton": True
            },
            "delay": 800
        },
        {
            "action": "add",
            "shotType": "dialogue",
            "content": (
                "This stage is dedicated to cleaning and pre-processing the data. "
                "We will follow a systematic approach to ensure the data is accurate "
                "and ready for analysis."
            ),
            "metadata": { "hideRemoveButton": True },
            "delay": 800
        },
        {
            "action": "add",
            "shotType": "dialogue", 
            "content": "我们将按照以下步骤进行数据清洗和预处理:\n\n1. 回顾背景信息\n2. 加载数据\n3. 检查数据\n4. 清洗和预处理",
            "metadata": { "hideRemoveButton": True },
            "delay": 800
        },
        {
            "action": "end_phase",
            "phaseId": "data-cleaning-step0",
            "metadata": {
                "isCompleted": True,
                "completionTime": "",
                "stepId": "data-cleaning-step0-step"
            }
        }
    ],
    # ---------------------- STEP 1 ----------------------
    [
        {
            "action": "add",
            "shotType": "dialogue",
            "content": "### Step 1: Review background information",
            "metadata": {
                "icon": "FileText",
                "hideRemoveButton": True
            },
            "delay": 800
        },
        # ... 此处省略部分内容
        {
            "action": "add",
            "shotType": "dialogue",
            "content": (
                "- **What does each variable measure?** The data dictionary provides descriptions "
                "for each feature.\n"
                "- **How was the data collected?** Information is limited to what is available "
                "from the repository and the associated paper.\n"
                "- **What are the observational units?** Each row corresponds to a single user session.\n"
                "- **Is the data relevant?** It is relevant for predicting purchase intent for sessions "
                "on the e-commerce site."
            ),
            "metadata": { "hideRemoveButton": True },
            "delay": 800
        }
    ],
    # ---------------------- STEP 2, STEP 3, STEP 4 ----------------------
    # 其余步骤操作内容保持不变...
]

def create_step_sequence(step_index: int):
    print(f"[APP DEBUG] 生成step_index {step_index}的序列")
    if step_index < 0 or step_index >= len(STEP_CONTENTS):
        print(f"[APP ERROR] 无效的step_index: {step_index}, 范围应为0-{len(STEP_CONTENTS)-1}")
        return {"steps": [], "error": "Invalid step index"}
    
    steps = STEP_CONTENTS[step_index]
    print(f"[APP DEBUG] 找到的steps: {len(steps)}项")
    
    if not isinstance(steps, list):
        print(f"[APP WARN] steps不是列表类型: {type(steps)}")
        steps = []
        
    return {"steps": steps}

@app.route("/api/cleaning_steps/<int:step_index>", methods=["GET"])
def get_cleaning_steps(step_index: int):
    if step_index < 0 or step_index >= len(CLEANING_STEPS):
        return jsonify({"steps": [], "error": "Invalid step index"}), 400
    
    sequence_data = create_step_sequence(step_index)
    return jsonify(sequence_data)

@app.route("/api/stateOperations", methods=["POST"])
def state_operations():
    try:
        data = request.get_json()
        print(f"[APP DEBUG] 收到请求数据: {data}")
        if not data:
            error_response = {"error": "No data provided", "steps": []}
            print(f"[APP ERROR] 错误: 无数据提供 {error_response}")
            return jsonify(error_response), 400

        state_id = data.get("stateId")
        if not state_id:
            error_response = {"error": "stateId is required", "steps": []}
            print(f"[APP ERROR] 错误: 未提供stateId {error_response}")
            return jsonify(error_response), 400
            
        context_data = data.get("contextData", {})
        step_index = next((i for i, step in enumerate(CLEANING_STEPS) if step["id"] == state_id), None)
        if step_index is None:
            error_response = {"error": f"Invalid state ID: {state_id}", "steps": []}
            print(f"[APP ERROR] 错误: 无效的stateId {error_response}")
            return jsonify(error_response), 400

        sequence = create_step_sequence(step_index)
        steps_raw = sequence.get("steps", [])
        print(f"[APP DEBUG] steps_raw: {steps_raw}")
        
        if not isinstance(steps_raw, list):
            print(f"[APP WARN] create_step_sequence返回的steps不是列表: {type(steps_raw)}")
            steps_raw = []
        
        steps = []
        for step in steps_raw:
            step_copy = step.copy()
            step_copy["type"] = "sequence_step"
            steps.append(step_copy)

        current_step_id = CLEANING_STEPS[step_index]["stepId"]
        next_step_id = CLEANING_STEPS[step_index + 1]["stepId"] if step_index < len(CLEANING_STEPS) - 1 else None

        if steps:
            step_completed_step = {
                "type": "sequence_step",
                "action": "set_completed_current_step",
                "shotType": "system",
                "content": "场景完成",
                "stepId": current_step_id,
                "metadata": {
                    "isCompleted": True,
                    "completionTime": context_data.get("completionTime", "")
                }
            }
            steps.append(step_completed_step)
            
            if next_step_id:
                next_step_step = {
                    "type": "sequence_step",
                    "action": "new_step",
                    "stepId": next_step_id,
                    "shotType": "system", 
                    "content": f"创建新场景: {next_step_id}",
                    "metadata": {
                        "autoSwitch": True
                    }
                }
                steps.append(next_step_step)
                
                switch_step_step = {
                    "type": "sequence_step",
                    "action": "switch_step",
                    "stepId": next_step_id,
                    "shotType": "system",
                    "content": f"切换到新场景: {next_step_id}",
                    "metadata": {}
                }
                steps.append(switch_step_step)

        available_next_states = []
        if step_index < len(CLEANING_STEPS) - 1:
            next_step = CLEANING_STEPS[step_index + 1]
            available_next_states.append({
                "id": next_step["id"],
                "name": next_step["title"],
                "type": "next",
                "metadata": {"stepId": next_step["stepId"]}
            })

        response_payload = {
            "operations": steps,  
            "contextData": {
                "stepIndex": step_index,
                "totalSteps": len(CLEANING_STEPS),
                "executionStartTime": context_data.get("executionStartTime", ""),
                "stepCompleted": True,
                "currentStepId": current_step_id,
                "nextstepId": next_step_id
            },
            "stateComplete": True,
            "finalContextData": {
                "isCompleted": True,
                "completionTime": context_data.get("completionTime", ""),
                "stepId": current_step_id,
                "nextstepId": next_step_id
            },
            "availableNextStates": available_next_states
        }
        
        print(f"[APP DEBUG] 返回响应: steps数量={len(steps)}；当前场景ID: {current_step_id}, 下一场景ID: {next_step_id}")
        return jsonify(response_payload)
    
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"[APP ERROR] 处理请求时发生错误: {str(e)}\n{error_msg}")
        return jsonify({"error": str(e), "steps": []}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
