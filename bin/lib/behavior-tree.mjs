export const NodeType = {
  SELECTOR: 'SELECTOR',
  SEQUENCE: 'SEQUENCE',
  CONDITION: 'CONDITION',
  ACTION: 'ACTION'
};

export class BehaviorTree {
  constructor(definition) {
    this.root = this.parseNode(definition);
    this.executionPath = [];
  }

  parseNode(def) {
    const node = {
      type: def.type,
      name: def.name || null,
      children: [],
      condition: def.condition || null,
      action: def.action || null
    };

    if (def.children && Array.isArray(def.children)) {
      node.children = def.children.map(child => this.parseNode(child));
    }

    return node;
  }

  execute(context = {}) {
    this.executionPath = [];
    const result = this._executeNode(this.root, context);
    return {
      success: result.success,
      action: result.action || null,
      path: this.getPathString(),
      reason: result.reason || null
    };
  }

  _executeNode(node, context) {
    this.executionPath.push(node.name || node.type);

    switch (node.type) {
      case NodeType.SELECTOR:
        return this.executeSelector(node, context);
      case NodeType.SEQUENCE:
        return this.executeSequence(node, context);
      case NodeType.CONDITION:
        return this.executeCondition(node, context);
      case NodeType.ACTION:
        return this.executeAction(node, context);
      default:
        return { success: false, reason: `Unknown node type: ${node.type}` };
    }
  }

  executeSelector(node, context) {
    for (const child of node.children) {
      const result = this._executeNode(child, context);
      if (result.success) {
        return result;
      }
    }
    return { success: false, reason: 'No selector child succeeded' };
  }

  executeSequence(node, context) {
    let lastResult = { success: true };
    for (const child of node.children) {
      lastResult = this._executeNode(child, context);
      if (!lastResult.success) {
        return lastResult;
      }
    }
    return lastResult;
  }

  executeCondition(node, context) {
    const result = this.evaluateCondition(node.condition, context);
    return {
      success: result,
      reason: result ? `Condition met: ${node.name}` : `Condition failed: ${node.name}`
    };
  }

  executeAction(node, context) {
    return {
      success: true,
      action: node.action || node.name,
      reason: `Action: ${node.name}`
    };
  }

  evaluateCondition(condition, context) {
    if (typeof condition === 'function') {
      return condition(context);
    }

    if (typeof condition !== 'string') {
      return false;
    }

    const trimmed = condition.trim();

    if (trimmed.startsWith('has ')) {
      const key = trimmed.slice(4).trim();
      return key in context;
    }

    const neqMatch = trimmed.match(/^(.+?)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const key = neqMatch[1].trim();
      const value = this._parseValue(neqMatch[2].trim());
      return context[key] !== value;
    }

    const eqMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/);
    if (eqMatch) {
      const key = eqMatch[1].trim();
      const value = this._parseValue(eqMatch[2].trim());
      return context[key] === value;
    }

    const gtMatch = trimmed.match(/^(.+?)\s*>\s*(.+)$/);
    if (gtMatch) {
      const key = gtMatch[1].trim();
      const value = this._parseValue(gtMatch[2].trim());
      return context[key] > value;
    }

    const ltMatch = trimmed.match(/^(.+?)\s*<\s*(.+)$/);
    if (ltMatch) {
      const key = ltMatch[1].trim();
      const value = this._parseValue(ltMatch[2].trim());
      return context[key] < value;
    }

    return !!context[trimmed];
  }

  _parseValue(str) {
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str === 'null') return null;
    const num = Number(str);
    if (!isNaN(num)) return num;
    return str;
  }

  getPathString() {
    return this.executionPath.join(' -> ');
  }
}

export const BehaviorTemplates = {
  courtIntrigue: {
    type: NodeType.SELECTOR,
    name: 'court_intrigue',
    children: [
      {
        type: NodeType.SEQUENCE,
        name: 'self_preservation',
        children: [
          { type: NodeType.CONDITION, name: 'in_danger', condition: 'danger > 0' },
          { type: NodeType.ACTION, name: 'protect_self', action: 'seek_protection' }
        ]
      },
      {
        type: NodeType.SEQUENCE,
        name: 'pursue_power',
        children: [
          { type: NodeType.CONDITION, name: 'has_opportunity', condition: 'opportunity == true' },
          { type: NodeType.ACTION, name: 'seize_power', action: 'maneuver_for_position' }
        ]
      },
      {
        type: NodeType.SEQUENCE,
        name: 'maintain_alliance',
        children: [
          { type: NodeType.CONDITION, name: 'has_allies', condition: 'has allies' },
          { type: NodeType.ACTION, name: 'strengthen_bonds', action: 'court_diplomacy' }
        ]
      },
      {
        type: NodeType.ACTION,
        name: 'default_action',
        action: 'observe_court'
      }
    ]
  },

  spymaster: {
    type: NodeType.SELECTOR,
    name: 'spymaster',
    children: [
      {
        type: NodeType.SEQUENCE,
        name: 'respond_to_threat',
        children: [
          { type: NodeType.CONDITION, name: 'threat_detected', condition: 'threat_level > 5' },
          { type: NodeType.ACTION, name: 'neutralize', action: 'counter_intelligence' }
        ]
      },
      {
        type: NodeType.SEQUENCE,
        name: 'gather_intel',
        children: [
          { type: NodeType.CONDITION, name: 'has_network', condition: 'has spy_network' },
          { type: NodeType.ACTION, name: 'collect_info', action: 'gather_information' }
        ]
      },
      {
        type: NodeType.SEQUENCE,
        name: 'plant_disinfo',
        children: [
          { type: NodeType.CONDITION, name: 'has_target', condition: 'has target_faction' },
          { type: NodeType.ACTION, name: 'spread_lies', action: 'disinformation_campaign' }
        ]
      },
      {
        type: NodeType.ACTION,
        name: 'maintain_cover',
        action: 'blend_in'
      }
    ]
  },

  authority: {
    type: NodeType.SELECTOR,
    name: 'authority_figure',
    children: [
      {
        type: NodeType.SEQUENCE,
        name: 'enforce_order',
        children: [
          { type: NodeType.CONDITION, name: 'law_broken', condition: 'crime_committed == true' },
          { type: NodeType.ACTION, name: 'punish', action: 'administer_justice' }
        ]
      },
      {
        type: NodeType.SEQUENCE,
        name: 'defend_territory',
        children: [
          { type: NodeType.CONDITION, name: 'territory_threatened', condition: 'invasion == true' },
          { type: NodeType.ACTION, name: 'mobilize', action: 'raise_army' }
        ]
      },
      {
        type: NodeType.SEQUENCE,
        name: 'expand_influence',
        children: [
          { type: NodeType.CONDITION, name: 'stable_rule', condition: 'stability > 7' },
          { type: NodeType.ACTION, name: 'expand', action: 'diplomatic_expansion' }
        ]
      },
      {
        type: NodeType.ACTION,
        name: 'govern',
        action: 'administer_territory'
      }
    ]
  }
};

export function createTreeFromTemplate(templateName) {
  const template = BehaviorTemplates[templateName];
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }
  return new BehaviorTree(template);
}

export function createTreeFromJson(jsonDef) {
  const def = typeof jsonDef === 'string' ? JSON.parse(jsonDef) : jsonDef;
  return new BehaviorTree(def);
}
