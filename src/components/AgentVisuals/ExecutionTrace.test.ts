import {it,expect} from 'vitest';
import {projectExecution} from './ExecutionTrace';
it('projects out-of-order children and rejects cyclic identities',()=>{
 const parent={id:'root',runtime:'aal' as const,name:'Agent.run',status:'running' as const,startedAt:10};
 const child={...parent,id:'child',parentId:'root',runtime:'model' as const};
 const view=projectExecution([child,parent]);
 expect(view.roots).toHaveLength(1);expect(view.roots[0].children?.[0].id).toBe('child');expect(view.tasks[0].start).toBe(10);
 expect(()=>projectExecution([child,{...parent,parentId:'child'}])).toThrow('Cyclic');
});
