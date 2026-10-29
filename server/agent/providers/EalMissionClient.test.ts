import {it,expect} from 'vitest';
import {projectEalTrace} from './EalMissionClient';
it('projects only observed EAL steps with actual timestamp and status',()=>{
 const spans=projectEalTrace({schema_version:1,mission_id:'run',mission_name:'mission',started_at_unix_ms:10,completed_at_unix_ms:30,outcome:'partial',traces_truncated:0,step_traces:[{step_id:'one',ability:'agent.work',started_at_unix_ms:12,completed_at_unix_ms:20,outcome:'completed',error:null},{step_id:'two',ability:'agent.check',started_at_unix_ms:21,completed_at_unix_ms:30,outcome:'failed',error:'unreachable'}]});
 expect(spans.map(s=>s.status)).toEqual(['failed','done','failed']);expect(spans[1].parentId).toBe('eal:run');expect(spans[2].endedAt).toBe(30);
});
