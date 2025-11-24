import { b0 as d, b1 as g, b2 as N, b3 as S, b4 as A, b5 as k, b6 as I } from './index-DA3ohzAm.js';
import { b7 as K } from './index-DA3ohzAm.js';
class w extends g {
  execute(t) {
    var i, a;
    const e = t.shotType === 'action' ? 'code' : 'text',
      o = t.content || '';
    if (
      (console.log(`[AddAction] shotType: ${t.shotType}, cellType: ${e}`),
      o.replace(/\n/g, ' '),
      e === 'text')
    ) {
      const s = N.getState(),
        c = s.cells,
        l = c.length > 0 ? c[c.length - 1] : null;
      if (
        (console.log(
          '[AddAction] Last cell:',
          l
            ? {
                id: l.id,
                type: l.type,
                contentPreview: (i = l.content) == null ? void 0 : i.substring(0, 50),
                startsWithHash: (a = l.content) == null ? void 0 : a.trim().startsWith('#'),
              }
            : 'none'
        ),
        l && l.type === 'markdown' && l.content)
      )
        if (l.content.trim().startsWith('#'))
          console.log('[AddAction] Last cell is a heading, creating new cell');
        else {
          const u =
            l.content +
            `

` +
            o;
          return (
            s.updateCell(l.id, u),
            console.log(`[AddAction] ✅ Appended to existing cell: ${l.id}`),
            l.id
          );
        }
      else console.log('[AddAction] No suitable last cell for appending, creating new cell');
    }
    const n = this.scriptStore.addCell(e, o, t.metadata);
    return (console.log(`[AddAction] Created new ${e} cell: ${n}`), n);
  }
}
class $ extends w {
  execute(t) {
    const e = { ...t, shotType: 'markdown' };
    return super.execute(e);
  }
}
d('add', w);
d('add-text', $);
class P extends g {
  execute(t) {
    const e = `## ${t.content || ''}`,
      o = { ...t.metadata, isChapter: !0 },
      n = this.scriptStore.addCell('text', e, o);
    return (console.log(`[NewChapterAction] Created chapter: ${n}`), n);
  }
}
d('new_chapter', P);
class U extends g {
  execute(t) {
    const e = `## ${t.content || ''}`,
      o = { ...t.metadata, isSection: !0 },
      n = this.scriptStore.addCell('text', e, o);
    return (console.log(`[NewSectionAction] Created section: ${n}`), n);
  }
}
d('new_section', U);
class b extends g {
  execute(t) {
    const e = `### ${t.content || ''}`,
      o = { ...t.metadata, isStep: !0 },
      n = this.scriptStore.addCell('text', e, o);
    return (console.log(`[NewStepAction] Created step: ${n}`), n);
  }
}
d('new_step', b);
class E extends g {
  execute(t) {
    var c, l;
    const e = 'text',
      o = t.content || '';
    (console.log(`[AddAction] shotType: ${t.shotType}, cellType: ${e}`), o.replace(/\n/g, ' '));
    const n = N.getState(),
      i = n.cells,
      a = i.length > 0 ? i[i.length - 1] : null;
    if (
      (console.log(
        '[AddAction] Last cell:',
        a
          ? {
              id: a.id,
              type: a.type,
              contentPreview: (c = a.content) == null ? void 0 : c.substring(0, 50),
              startsWithHash: (l = a.content) == null ? void 0 : l.trim().startsWith('#'),
            }
          : 'none'
      ),
      a && a.type === 'markdown' && a.content)
    )
      if (a.content.trim().startsWith('#'))
        console.log('[AddAction] Last cell is a heading, creating new cell');
      else {
        const u = a.content + o;
        return (
          n.updateCell(a.id, u),
          console.log(`[AddAction] ✅ Appended to existing cell: ${a.id}`),
          a.id
        );
      }
    else console.log('[AddAction] No suitable last cell for appending, creating new cell');
    const s = this.scriptStore.addCell(e, o, t.metadata);
    return (console.log(`[AddAction] Created new ${e} cell: ${s}`), s);
  }
}
d('comment-result', E);
class M extends g {
  async execute(t) {
    if (!t.codecell_id) return (console.warn('[ExecCodeAction] Requires codecell_id'), null);
    const e =
      t.codecell_id === 'lastAddedCellId' ? this.scriptStore.lastAddedActionId : t.codecell_id;
    if (!e) return (console.warn('[ExecCodeAction] No valid cell ID'), null);
    (console.log(`[ExecCodeAction] Executing code: ${e}`),
      S.createAIRunningCode('Executing...', '', [], e, !0));
    try {
      const o = await this.scriptStore.execCodeCell(e, t.need_output ?? !0, t.auto_debug ?? !1);
      return (S.createAIRunningCode('Execution completed', '', [], e, !1), o);
    } catch (o) {
      throw (
        console.error('[ExecCodeAction] Execution failed:', o),
        S.createAIRunningCode('Execution failed', '', [], e, !1),
        o
      );
    }
  }
}
d('exec', M);
class y extends g {
  execute(t) {
    const e = t.thinkingText || 'finished thinking';
    (this.scriptStore.setEffectAsThinking(e),
      console.log(`[SetEffectThinkingAction] Set thinking text: ${e}`));
  }
}
d('set_effect_as_thinking', y);
class O extends g {
  execute(t) {
    const e = this.scriptStore.addCell(
      'thinking',
      '',
      {},
      {
        textArray: t.textArray || ['AI is thinking...'],
        agentName: t.agentName || 'AI',
        customText: t.customText || null,
      }
    );
    return (console.log(`[IsThinkingAction] Created thinking cell: ${e}`), e);
  }
}
d('is_thinking', O);
class v extends g {
  execute(t) {
    (this.scriptStore.finishThinking(),
      console.log('[FinishThinkingAction] Removed thinking indicator'));
  }
}
d('finish_thinking', v);
class J extends g {
  execute(t) {
    const e = t.title || t.content;
    if (!e) {
      console.warn('[UpdateTitleAction] No title provided');
      return;
    }
    (this.scriptStore.updateTitle(e), console.log(`[UpdateTitleAction] Updated title: ${e}`));
  }
}
d('update_title', J);
class R extends g {
  execute(t) {
    if (!t.text) {
      console.warn('[UpdateLastTextAction] No text provided');
      return;
    }
    (this.scriptStore.updateLastText(t.text),
      console.log('[UpdateLastTextAction] Updated last text'));
  }
}
d('update_last_text', R);
class W extends g {
  execute(t) {
    const e = t.stageId || t.stage_id,
      { title: o, task: n, acceptance: i } = t;
    if (!e || !o || !n || !i) {
      console.error('[PlanStageAction] Missing required fields:', t);
      return;
    }
    const a = A.getState(),
      s = a.stateJSON,
      c = s.observation;
    c.location.progress.stages.planned || (c.location.progress.stages.planned = []);
    const l = c.location.progress.stages.planned.findIndex((u) => u.stage_id === e),
      p = { stage_id: e, title: o, task: n, acceptance: i, planning_complete: !1 };
    (l >= 0
      ? ((c.location.progress.stages.planned[l] = {
          ...c.location.progress.stages.planned[l],
          ...p,
        }),
        console.log(`[PlanStageAction] ✅ Updated stage: ${e}`))
      : (c.location.progress.stages.planned.push(p),
        console.log(`[PlanStageAction] ✅ Added new stage: ${e}`)),
      a.setState(s));
  }
}
d('plan_stage', W);
class F extends g {
  execute(t) {
    const e = t.totalStages || t.total_stages,
      o = A.getState(),
      n = o.stateJSON,
      i = n.observation;
    if (
      (console.log(`[CompleteWorkflowPlanningAction] Workflow planning complete with ${e} stages`),
      (n.state.FSM.workflow_planned = !0),
      n.state.FSM.state === 'IDLE')
    ) {
      const a = i.location.progress.stages.planned || [];
      if (a.length > 0) {
        ((i.location.current.stage_id = a[0].stage_id),
          (n.state.FSM.state = 'STAGE_RUNNING'),
          console.log(
            `[CompleteWorkflowPlanningAction] ✅ Transitioned to STAGE_RUNNING, current stage: ${a[0].stage_id}`
          ));
        const s = a[0].title;
        s &&
          (console.log(
            `[CompleteWorkflowPlanningAction] Executing new_section for first stage: "${s}"`
          ),
          k('new_section', s));
      } else console.warn('[CompleteWorkflowPlanningAction] No stages planned, cannot transition');
    }
    o.setState(n);
  }
}
d('complete_workflow_planning', F);
class G extends g {
  execute(t) {
    const e = t.stepId || t.step_id,
      { title: o, task: n, acceptance: i } = t;
    if (!e || !o || !n || !i) {
      console.error('[PlanStepAction] Missing required fields:', t);
      return;
    }
    const a = A.getState(),
      s = a.stateJSON,
      c = s.observation;
    c.location.progress.steps.planned || (c.location.progress.steps.planned = []);
    const l = c.location.progress.steps.planned.findIndex((u) => u.step_id === e),
      p = { step_id: e, title: o, task: n, acceptance: i, planning_complete: !1 };
    (l >= 0
      ? ((c.location.progress.steps.planned[l] = { ...c.location.progress.steps.planned[l], ...p }),
        console.log(`[PlanStepAction] ✅ Updated step: ${e}`))
      : (c.location.progress.steps.planned.push(p),
        console.log(`[PlanStepAction] ✅ Added new step: ${e}`)),
      a.setState(s));
  }
}
d('plan_step', G);
class D extends g {
  execute(t) {
    var l, p, u, x, f, h, _, m, C;
    const { stage_id: e, focus: o, notes: n } = t;
    if (!e) {
      console.error('[UpdateStageContextAction] Missing stage_id:', t);
      return;
    }
    const i = A.getState(),
      a = i.stateJSON,
      s = a.observation;
    if (
      !(
        (u =
          (p = (l = s == null ? void 0 : s.location) == null ? void 0 : l.progress) == null
            ? void 0
            : p.stages) != null && u.planned
      )
    ) {
      console.warn('[UpdateStageContextAction] Invalid observation structure:', {
        hasObservation: !!s,
        hasLocation: !!(s != null && s.location),
        hasProgress: !!((x = s == null ? void 0 : s.location) != null && x.progress),
        hasStages: !!(
          (h = (f = s == null ? void 0 : s.location) == null ? void 0 : f.progress) != null &&
          h.stages
        ),
        hasPlanned: !!(
          (C =
            (m = (_ = s == null ? void 0 : s.location) == null ? void 0 : _.progress) == null
              ? void 0
              : m.stages) != null && C.planned
        ),
      });
      return;
    }
    const c = s.location.progress.stages.planned.find((T) => T.stage_id === e);
    if (!c) {
      console.warn(`[UpdateStageContextAction] Stage not found: ${e}`);
      return;
    }
    (o !== void 0 && (c.focus = o),
      n !== void 0 && (c.notes = n),
      console.log(`[UpdateStageContextAction] ✅ Updated context for stage: ${e}`, {
        focus: o,
        notes: n,
      }),
      i.setState(a));
  }
}
d('update_stage_context', D);
class L extends g {
  execute(t) {
    var s;
    const e = t.stageId || t.stage_id,
      o = t.totalSteps || t.total_steps;
    if (!e) {
      console.error('[CompleteStagePlanningAction] Missing stage_id:', t);
      return;
    }
    const n = A.getState(),
      i = n.stateJSON;
    console.log(`[CompleteStagePlanningAction] Stage planning complete: ${e} with ${o} steps`);
    const a =
      (s = i.observation.location.progress.stages.planned) == null
        ? void 0
        : s.find((c) => c.stage_id === e);
    if ((a && (a.planning_complete = !0), i.state.FSM.state === 'STAGE_RUNNING')) {
      const c = i.observation.location.progress.steps.planned || [];
      c.length > 0
        ? ((i.observation.location.current.step_id = c[0].step_id),
          (i.state.FSM.state = 'STEP_RUNNING'),
          console.log(
            `[CompleteStagePlanningAction] ✅ Transitioned to STEP_RUNNING, current step: ${c[0].step_id}`
          ))
        : console.warn('[CompleteStagePlanningAction] No steps planned, cannot transition');
    }
    n.setState(i);
  }
}
d('complete_stage_planning', L);
class q extends g {
  execute(t) {
    var l, p;
    const e = t.stepId || t.step_id,
      o = t.taskDescription || ((l = t.metadata) == null ? void 0 : l.task_description),
      n = t.agent,
      i = t.acceptance;
    if (!e || !n || !o || !i) {
      console.error('[DelegateTaskAction] Missing required fields:', t);
      return;
    }
    const a = A.getState(),
      s = a.stateJSON,
      c =
        (p = s.observation.location.progress.steps.planned) == null
          ? void 0
          : p.find((u) => u.step_id === e);
    if (!c) {
      console.warn(`[DelegateTaskAction] Step not found: ${e}`);
      return;
    }
    ((c.delegated_to = n),
      (c.detailed_task = o),
      (c.acceptance = i),
      (s.observation.location.current.behavior = { agent: n, task: o, acceptance: i }),
      console.log(`[DelegateTaskAction] ✅ Delegated step ${e} to ${n}`),
      a.setState(s));
  }
}
d('delegate_task', q);
class H extends g {
  execute(t) {
    var a;
    const e = t.stepId || t.step_id;
    if (!e) {
      console.error('[CompleteStepPlanningAction] Missing step_id:', t);
      return;
    }
    const o = A.getState(),
      n = o.stateJSON;
    console.log(`[CompleteStepPlanningAction] Step planning complete: ${e}`);
    const i =
      (a = n.observation.location.progress.steps.planned) == null
        ? void 0
        : a.find((s) => s.step_id === e);
    (i && (i.planning_complete = !0),
      n.state.FSM.state === 'STEP_RUNNING' &&
        ((n.state.FSM.state = 'BEHAVIOR_RUNNING'),
        console.log('[CompleteStepPlanningAction] ✅ Transitioned to BEHAVIOR_RUNNING')),
      o.setState(n));
  }
}
d('complete_step_planning', H);
class B extends g {
  execute(t) {
    const e = t.focus;
    if (!e) {
      console.error('[UpdateStepFocusAction] Missing focus field:', t);
      return;
    }
    const o = A.getState(),
      n = o.stateJSON;
    ((n.observation.location.progress.steps.focus = e),
      console.log(`[UpdateStepFocusAction] ✅ Updated step focus: ${e}`),
      o.setState(n));
  }
}
d('update-step-focus', B);
console.log('[Actions] All actions registered:', I());
export {
  g as ActionBase,
  k as executeAction,
  K as getActionClass,
  I as getAllActionTypes,
  d as registerAction,
};
