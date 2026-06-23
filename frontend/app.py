import streamlit as st
import json
import subprocess
import pandas as pd
from pathlib import Path

st.set_page_config(page_title="NovelTips Dashboard", layout="wide")

st.title("NovelTips 叙事代理工作区")

# Configuration - resolve paths relative to repo root (parent of frontend/)
_REPO_ROOT = str(Path(__file__).parent.parent)
WORLD_PATH = st.sidebar.text_input("World JSON Path", "examples/qingyu-like/world.json")
STATE_DIR = st.sidebar.text_input("State Directory", ".novaltips/state")
CLI_PATH = str(Path(_REPO_ROOT) / "bin" / "novaltips.mjs")

def run_cli(command, *args):
    """Run NovelTips CLI command and return output."""
    cmd_list = ["node", CLI_PATH, command, *args]
    try:
        result = subprocess.run(
            cmd_list, capture_output=True, text=True, cwd=_REPO_ROOT
        )
        if result.returncode == 0:
            return result.stdout
        else:
            st.error(f"CLI Error: {result.stderr}")
            return None
    except Exception as e:
        st.error(f"Failed to run CLI: {e}")
        return None

@st.cache_data
def load_json_file(path):
    """Load and parse a JSON file."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        st.error(f"Failed to load {path}: {e}")
        return None

def load_jsonl_file(path):
    """Load and parse a JSONL file."""
    try:
        records = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records
    except Exception as e:
        st.error(f"Failed to load {path}: {e}")
        return []

# Navigation
page = st.sidebar.radio("导航", [
    "World Overview",
    "Character Explorer",
    "Scene Simulator",
    "Memory Viewer",
    "Evaluation Reports"
])

# Page 1: World Overview
if page == "World Overview":
    st.header("World Overview")
    
    world_data = load_json_file(str(Path(_REPO_ROOT) / WORLD_PATH))
    if world_data:
        # Facts table
        st.subheader("World Facts")
        facts = world_data.get("facts", [])
        if facts:
            facts_df = pd.DataFrame(facts)
            if 'characters' in facts_df.columns:
                facts_df['characters'] = facts_df['characters'].apply(
                    lambda x: ', '.join(x) if isinstance(x, list) else str(x)
                )
            st.dataframe(facts_df[['id', 'kind', 'visibility', 'characters', 'summary']], use_container_width=True)
        else:
            st.info("No facts found in world file.")
        
        # Character Skills
        st.subheader("Character Skills")
        skills = world_data.get("skills", [])
        if skills:
            for skill in skills:
                with st.expander(f"{skill['name']} ({skill['characterId']})"):
                    col1, col2 = st.columns(2)
                    with col1:
                        st.write("**Identity:**")
                        for item in skill.get('identity', []):
                            st.write(f"- {item}")
                        st.write("**Voice:**")
                        for item in skill.get('voice', []):
                            st.write(f"- {item}")
                        st.write("**Values:**")
                        for item in skill.get('values', []):
                            st.write(f"- {item}")
                    with col2:
                        st.write("**Behavior Policy:**")
                        for key, value in skill.get('behaviorPolicy', {}).items():
                            st.write(f"- **{key}:** {value}")
                        st.write("**Relationships:**")
                        for key, value in skill.get('relationships', {}).items():
                            st.write(f"- **{key}:** {value}")
        else:
            st.info("No character skills found.")

# Page 2: Character Explorer
elif page == "Character Explorer":
    st.header("Character Explorer")
    
    world_data = load_json_file(str(Path(_REPO_ROOT) / WORLD_PATH))
    if world_data:
        skills = world_data.get("skills", [])
        if skills:
            character_ids = [s['characterId'] for s in skills]
            selected_char = st.selectbox("Select Character", character_ids)
            
            skill = next((s for s in skills if s['characterId'] == selected_char), None)
            
            if skill:
                col1, col2 = st.columns([1, 1])
                
                with col1:
                    st.subheader("Character Skill (Markdown)")
                    # Export skill as markdown
                    md_lines = [
                        f"# Character Skill: {skill['name']}",
                        "",
                        "## Aliases",
                        *[f"- {a}" for a in skill.get('aliases', [])],
                        "",
                        "## Identity",
                        *[f"- {i}" for i in skill.get('identity', [])],
                        "",
                        "## Voice",
                        *[f"- {v}" for v in skill.get('voice', [])],
                        "",
                        "## Voice Cues",
                        *[f"- {c}" for c in skill.get('voiceCues', [])],
                        "",
                        "## Values",
                        *[f"- {v}" for v in skill.get('values', [])],
                        "",
                        "## Behavior Policy",
                        *[f"- {k}: {v}" for k, v in skill.get('behaviorPolicy', {}).items()],
                        "",
                        "## Known Facts",
                        *[f"- {f}" for f in skill.get('knownFacts', [])],
                        "",
                        "## Unknown Facts",
                        *[f"- {f}" for f in skill.get('unknownFacts', [])],
                        "",
                        "## Relationships",
                        *[f"- {k}: {v}" for k, v in skill.get('relationships', {}).items()],
                        "",
                        "## Forbidden",
                        *[f"- {f}" for f in skill.get('forbidden', [])]
                    ]
                    md_content = "\n".join(md_lines)
                    st.code(md_content, language="markdown")
                    
                    st.download_button(
                        label="Download Markdown",
                        data=md_content,
                        file_name=f"{selected_char}_skill.md",
                        mime="text/markdown"
                    )
                
                with col2:
                    st.subheader("Related World Facts")
                    facts = world_data.get("facts", [])
                    related_facts = [f for f in facts if selected_char in f.get('characters', [])]
                    
                    if related_facts:
                        for fact in related_facts:
                            st.write(f"**{fact['id']}** ({fact['kind']})")
                            st.write(f"_{fact['summary']}_")
                            st.write(f"Visibility: {fact['visibility']}")
                            st.divider()
                    else:
                        st.info("No related facts found.")
                    
                    st.subheader("Relationships")
                    for target, description in skill.get('relationships', {}).items():
                        st.write(f"**{target}:** {description}")
        else:
            st.info("No characters found in world file.")

# Page 3: Scene Simulator
elif page == "Scene Simulator":
    st.header("Scene Simulator")
    
    # Load scene file
    scene_files = list(Path(_REPO_ROOT, "examples").glob("**/*.json"))
    scene_files = [f for f in scene_files if "scene" in f.name.lower()]
    
    if scene_files:
        selected_scene_file = st.selectbox(
            "Select Scene File",
            scene_files,
            format_func=lambda x: x.name
        )
        
        scene_data = load_json_file(str(selected_scene_file))
        
        if scene_data:
            st.json(scene_data)
            
            col1, col2 = st.columns(2)
            
            with col1:
                if st.button("Run Simulation"):
                    with st.spinner("Running simulation..."):
                        output = run_cli("simulate-scene", str(selected_scene_file), "--world", WORLD_PATH, "--state-dir", STATE_DIR)
                        if output:
                            try:
                                result = json.loads(output)
                                st.session_state['simulation_result'] = result
                                st.success("Simulation completed!")
                            except json.JSONDecodeError:
                                st.text(output)
            
            with col2:
                if st.button("Run LLM Simulation"):
                    with st.spinner("Running LLM simulation..."):
                        output = run_cli("llm-simulate-scene", str(selected_scene_file), "--world", WORLD_PATH, "--state-dir", STATE_DIR)
                        if output:
                            try:
                                result = json.loads(output)
                                st.session_state['simulation_result'] = result
                                st.success("LLM Simulation completed!")
                            except json.JSONDecodeError:
                                st.text(output)
            
            # Display results
            if 'simulation_result' in st.session_state:
                st.subheader("Simulation Results")
                result = st.session_state['simulation_result']
                
                st.write(f"**Scene:** {result.get('sceneId', 'N/A')}")
                st.write(f"**Setting:** {result.get('setting', 'N/A')}")
                st.write(f"**Topic:** {result.get('topic', 'N/A')}")
                st.write(f"**Summary:** {result.get('summary', 'N/A')}")
                
                # Turn log
                st.subheader("Turn Log")
                turns = result.get('turns', [])
                for turn in turns:
                    with st.expander(f"Turn {turn['turn']}: {turn['speaker']}"):
                        st.write(f"**Reason:** {turn['reason']}")
                        st.write(f"**Content:** {turn['content']}")
                        
                        consistency = turn.get('consistency', {})
                        st.write(f"**Consistency Score:** {consistency.get('score', 'N/A')}")
                        st.write(f"**Passed:** {consistency.get('passed', 'N/A')}")
                        
                        if consistency.get('issues'):
                            st.write("**Issues:**")
                            for issue in consistency['issues']:
                                st.write(f"- {issue['type']}: {issue['description']}")
                                st.write(f"  Suggestion: {issue['suggestion']}")
                        
                        state_delta = turn.get('stateDelta', {})
                        st.write(f"**Conflict Intensity Change:** {state_delta.get('conflictIntensityChange', 0)}")
                        
                        if state_delta.get('newClues'):
                            st.write("**New Clues:**")
                            for clue in state_delta['newClues']:
                                st.write(f"- {clue}")
    else:
        st.info("No scene files found. Create a scene JSON file first.")

# Page 4: Memory Viewer
elif page == "Memory Viewer":
    st.header("Memory Viewer")
    
    # Load scene state files
    scenes_dir = Path(_REPO_ROOT, STATE_DIR) / "scenes"
    if scenes_dir.exists():
        scene_files = list(scenes_dir.glob("*.json"))
        
        if scene_files:
            selected_scene = st.selectbox(
                "Select Scene State",
                scene_files,
                format_func=lambda x: x.stem
            )
            
            scene_state = load_json_file(str(selected_scene))
            
            if scene_state:
                col1, col2 = st.columns(2)
                
                with col1:
                    st.subheader("Scene State")
                    st.write(f"**Scene ID:** {scene_state.get('sceneId', 'N/A')}")
                    st.write(f"**Current Turn:** {scene_state.get('currentTurn', 0)}")
                    st.write(f"**Current Stage:** {scene_state.get('currentStage', 'N/A')}")
                    st.write(f"**Conflict Intensity:** {scene_state.get('conflictIntensity', 0)}")
                    st.write(f"**Status:** {scene_state.get('status', 'N/A')}")
                    st.write(f"**Participants:** {', '.join(scene_state.get('participants', []))}")
                
                with col2:
                    st.subheader("Clues")
                    clues = scene_state.get('clues', [])
                    for clue in clues:
                        st.write(f"- {clue}")
                
                st.subheader("Character Memories")
                memories = scene_state.get('characterMemories', {})
                for char_id, char_memories in memories.items():
                    with st.expander(f"{char_id} ({len(char_memories)} memories)"):
                        for mem in char_memories:
                            st.write(f"**Turn {mem['turn']}:** {mem['content']}")
                
                st.subheader("Relationship State")
                rel_state = scene_state.get('relationshipState', {})
                for rel_key, changes in rel_state.items():
                    with st.expander(f"{rel_key} ({len(changes)} changes)"):
                        for change in changes:
                            st.write(f"**Turn {change['turn']}:** {change['change']}")
        else:
            st.info("No scene state files found.")
    else:
        st.info(f"Scenes directory not found: {scenes_dir}")
    
    # Turn logs
    st.subheader("Turn Logs")
    turn_log_path = Path(_REPO_ROOT, STATE_DIR) / "turn_logs.jsonl"
    llm_turn_log_path = Path(_REPO_ROOT, STATE_DIR) / "llm_turn_logs.jsonl"
    
    log_type = st.radio("Log Type", ["Standard", "LLM"])
    log_path = llm_turn_log_path if log_type == "LLM" else turn_log_path
    
    if log_path.exists():
        logs = load_jsonl_file(str(log_path))
        if logs:
            for log in logs[-10:]:  # Show last 10
                with st.expander(f"Scene: {log.get('sceneId', 'N/A')} - Turn {log.get('turn', 'N/A')}"):
                    st.write(f"**Speaker:** {log.get('speaker', 'N/A')}")
                    st.write(f"**Content:** {log.get('content', 'N/A')}")
                    consistency = log.get('consistency', {})
                    st.write(f"**Consistency Score:** {consistency.get('score', 'N/A')}")
        else:
            st.info("No turn logs found.")
    else:
        st.info(f"Log file not found: {log_path}")

# Page 5: Evaluation Reports
elif page == "Evaluation Reports":
    st.header("Evaluation Reports")
    
    # Check for baseline files
    baselines_dir = Path(_REPO_ROOT, "baselines")
    if baselines_dir.exists():
        baseline_files = list(baselines_dir.glob("*.json"))
        
        if baseline_files:
            selected_baseline = st.selectbox(
                "Select Baseline Report",
                baseline_files,
                format_func=lambda x: x.name
            )
            
            baseline_data = load_json_file(str(selected_baseline))
            
            if baseline_data:
                evaluation = baseline_data.get('evaluation', {})
                
                st.subheader("Overall Score")
                overall_score = evaluation.get('overallScore', 0)
                st.progress(overall_score)
                st.write(f"**Score:** {overall_score:.2f}")
                
                st.subheader("Dimensions")
                dimensions = evaluation.get('dimensions', {})
                
                for dim_name, dim_data in dimensions.items():
                    with st.expander(f"{dim_name}"):
                        score = dim_data.get('score', 0)
                        st.progress(score)
                        st.write(f"**Score:** {score:.2f}")
                        if dim_data.get('feedback'):
                            st.write(f"**Feedback:** {dim_data['feedback']}")
                
                if evaluation.get('issues'):
                    st.subheader("Issues")
                    for issue in evaluation['issues']:
                        st.write(f"- {issue}")
                
                if evaluation.get('strengths'):
                    st.subheader("Strengths")
                    for strength in evaluation['strengths']:
                        st.write(f"- {strength}")
        else:
            st.info("No baseline reports found. Run evaluations first.")
    else:
        st.info("Baselines directory not found.")
    
    # Last validation results
    st.subheader("Last LLM Validation")
    validation_path = Path(_REPO_ROOT, STATE_DIR) / "last_llm_validation.json"
    if validation_path.exists():
        validation_data = load_json_file(str(validation_path))
        if validation_data:
            scene = validation_data.get('scene', {})
            llm_reports = validation_data.get('llmReports', [])
            
            st.write(f"**Scene:** {scene.get('sceneId', 'N/A')}")
            
            for report in llm_reports:
                with st.expander(f"Turn {report.get('turn', 'N/A')}: {report.get('speaker', 'N/A')}"):
                    report_data = report.get('report', {})
                    st.write(f"**Overall Score:** {report_data.get('overallScore', 'N/A')}")
                    
                    dimensions = report_data.get('dimensions', {})
                    for dim_name, dim_data in dimensions.items():
                        st.write(f"**{dim_name}:** {dim_data.get('score', 'N/A')}")
    else:
        st.info("No LLM validation results found.")

# Footer
st.sidebar.divider()
st.sidebar.markdown("---")
st.sidebar.markdown("**NovelTips** - Pi-based narrative agent workspace")
st.sidebar.markdown("Version 0.2.0")
