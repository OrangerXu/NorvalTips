import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NodeType,
  BehaviorTree,
  BehaviorTemplates,
  createTreeFromTemplate,
  createTreeFromJson
} from '../bin/lib/behavior-tree.mjs';

describe('BehaviorTree', () => {
  describe('NodeType', () => {
    it('should have correct enum values', () => {
      assert.equal(NodeType.SELECTOR, 'SELECTOR');
      assert.equal(NodeType.SEQUENCE, 'SEQUENCE');
      assert.equal(NodeType.CONDITION, 'CONDITION');
      assert.equal(NodeType.ACTION, 'ACTION');
    });
  });

  describe('Selector node', () => {
    it('should find first success in selector', () => {
      const tree = new BehaviorTree({
        type: NodeType.SELECTOR,
        name: 'root',
        children: [
          {
            type: NodeType.SEQUENCE,
            name: 'branch1',
            children: [
              { type: NodeType.CONDITION, name: 'fail_check', condition: 'value == no' },
              { type: NodeType.ACTION, name: 'action1', action: 'do_thing_1' }
            ]
          },
          {
            type: NodeType.SEQUENCE,
            name: 'branch2',
            children: [
              { type: NodeType.CONDITION, name: 'pass_check', condition: 'value == yes' },
              { type: NodeType.ACTION, name: 'action2', action: 'do_thing_2' }
            ]
          }
        ]
      });

      const result = tree.execute({ value: 'yes' });
      assert.equal(result.success, true);
      assert.equal(result.action, 'do_thing_2');
    });

    it('should fail when no child succeeds', () => {
      const tree = new BehaviorTree({
        type: NodeType.SELECTOR,
        name: 'root',
        children: [
          {
            type: NodeType.CONDITION,
            name: 'fail1',
            condition: 'value == no'
          },
          {
            type: NodeType.CONDITION,
            name: 'fail2',
            condition: 'value == never'
          }
        ]
      });

      const result = tree.execute({ value: 'yes' });
      assert.equal(result.success, false);
    });
  });

  describe('Sequence node', () => {
    it('should execute children in order', () => {
      const tree = new BehaviorTree({
        type: NodeType.SEQUENCE,
        name: 'root',
        children: [
          { type: NodeType.CONDITION, name: 'check1', condition: 'step == 1' },
          { type: NodeType.CONDITION, name: 'check2', condition: 'ready == true' },
          { type: NodeType.ACTION, name: 'final', action: 'complete' }
        ]
      });

      const result = tree.execute({ step: 1, ready: true });
      assert.equal(result.success, true);
      assert.equal(result.action, 'complete');
    });

    it('should fail on first failure', () => {
      const tree = new BehaviorTree({
        type: NodeType.SEQUENCE,
        name: 'root',
        children: [
          { type: NodeType.CONDITION, name: 'check', condition: 'value == yes' },
          { type: NodeType.ACTION, name: 'never_reached', action: 'should_not_run' }
        ]
      });

      const result = tree.execute({ value: 'no' });
      assert.equal(result.success, false);
    });
  });

  describe('Condition evaluation', () => {
    it('should evaluate equality', () => {
      const tree = new BehaviorTree({
        type: NodeType.CONDITION,
        name: 'test',
        condition: 'key == value'
      });

      assert.equal(tree.execute({ key: 'value' }).success, true);
      assert.equal(tree.execute({ key: 'other' }).success, false);
    });

    it('should evaluate inequality', () => {
      const tree = new BehaviorTree({
        type: NodeType.CONDITION,
        name: 'test',
        condition: 'key != value'
      });

      assert.equal(tree.execute({ key: 'other' }).success, true);
      assert.equal(tree.execute({ key: 'value' }).success, false);
    });

    it('should evaluate greater than', () => {
      const tree = new BehaviorTree({
        type: NodeType.CONDITION,
        name: 'test',
        condition: 'score > 5'
      });

      assert.equal(tree.execute({ score: 10 }).success, true);
      assert.equal(tree.execute({ score: 3 }).success, false);
    });

    it('should evaluate has', () => {
      const tree = new BehaviorTree({
        type: NodeType.CONDITION,
        name: 'test',
        condition: 'has weapon'
      });

      assert.equal(tree.execute({ weapon: 'sword' }).success, true);
      assert.equal(tree.execute({}).success, false);
    });

    it('should evaluate boolean values', () => {
      const tree = new BehaviorTree({
        type: NodeType.CONDITION,
        name: 'test',
        condition: 'flag == true'
      });

      assert.equal(tree.execute({ flag: true }).success, true);
      assert.equal(tree.execute({ flag: false }).success, false);
    });

    it('should evaluate function conditions', () => {
      const tree = new BehaviorTree({
        type: NodeType.CONDITION,
        name: 'test',
        condition: (ctx) => ctx.hp > 50 && ctx.mp > 20
      });

      assert.equal(tree.execute({ hp: 100, mp: 30 }).success, true);
      assert.equal(tree.execute({ hp: 10, mp: 30 }).success, false);
    });
  });

  describe('Execution path tracking', () => {
    it('should track execution path', () => {
      const tree = new BehaviorTree({
        type: NodeType.SELECTOR,
        name: 'root',
        children: [
          {
            type: NodeType.SEQUENCE,
            name: 'branch1',
            children: [
              { type: NodeType.CONDITION, name: 'check', condition: 'value == yes' },
              { type: NodeType.ACTION, name: 'act', action: 'do_it' }
            ]
          }
        ]
      });

      const result = tree.execute({ value: 'yes' });
      assert.equal(result.path, 'root -> branch1 -> check -> act');
    });
  });

  describe('Templates', () => {
    it('should work with courtIntrigue template', () => {
      const tree = createTreeFromTemplate('courtIntrigue');
      const result = tree.execute({ danger: 8 });
      assert.equal(result.success, true);
      assert.equal(result.action, 'seek_protection');
    });

    it('should work with spymaster template', () => {
      const tree = createTreeFromTemplate('spymaster');
      const result = tree.execute({ threat_level: 10 });
      assert.equal(result.success, true);
      assert.equal(result.action, 'counter_intelligence');
    });

    it('should work with authority template', () => {
      const tree = createTreeFromTemplate('authority');
      const result = tree.execute({ crime_committed: true });
      assert.equal(result.success, true);
      assert.equal(result.action, 'administer_justice');
    });

    it('should throw on unknown template', () => {
      assert.throws(() => createTreeFromTemplate('unknown'), /Unknown template/);
    });
  });

  describe('JSON creation', () => {
    it('should create tree from JSON object', () => {
      const tree = createTreeFromJson({
        type: NodeType.ACTION,
        name: 'simple',
        action: 'do_something'
      });
      const result = tree.execute({});
      assert.equal(result.success, true);
      assert.equal(result.action, 'do_something');
    });

    it('should create tree from JSON string', () => {
      const tree = createTreeFromJson('{"type":"ACTION","name":"simple","action":"do_it"}');
      const result = tree.execute({});
      assert.equal(result.success, true);
      assert.equal(result.action, 'do_it');
    });
  });
});
