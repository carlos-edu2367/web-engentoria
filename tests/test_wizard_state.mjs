import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isValidWizardId,
    normalizeWizardId,
    resolveWizardId,
    resolveWizardIds
} from '../frontend/assets/imobiliaria_modules/wizard-state.js';

test('resolveWizardIds retorna os IDs dos campos ocultos quando o estado interno está nulo', () => {
    const result = resolveWizardIds({
        hiddenClienteId: 'cliente-123',
        hiddenImovelId: 'imovel-456',
        stateClienteId: null,
        stateImovelId: null
    });

    assert.equal(result.clienteId, 'cliente-123');
    assert.equal(result.imovelId, 'imovel-456');
});

test('isValidWizardId rejeita null, undefined, strings equivalentes, vazias e espaços', () => {
    assert.equal(isValidWizardId(null), false);
    assert.equal(isValidWizardId(undefined), false);
    assert.equal(isValidWizardId(''), false);
    assert.equal(isValidWizardId('   '), false);
    assert.equal(isValidWizardId('null'), false);
    assert.equal(isValidWizardId('NULL'), false);
    assert.equal(isValidWizardId('Null'), false);
    assert.equal(isValidWizardId('undefined'), false);
    assert.equal(isValidWizardId('UNDEFINED'), false);
    assert.equal(isValidWizardId('Undefined'), false);
    assert.equal(isValidWizardId('cliente-123'), true);
});

test('normalizeWizardId e resolveWizardIds retornam nulo para IDs inválidos', () => {
    assert.equal(normalizeWizardId(null), null);
    assert.equal(normalizeWizardId(undefined), null);
    assert.equal(normalizeWizardId(''), null);
    assert.equal(normalizeWizardId('   '), null);
    assert.equal(normalizeWizardId('null'), null);
    assert.equal(normalizeWizardId('undefined'), null);

    const result = resolveWizardIds({
        hiddenClienteId: undefined,
        hiddenImovelId: '  ',
        stateClienteId: 'null',
        stateImovelId: 'undefined'
    });

    assert.equal(result.clienteId, null);
    assert.equal(result.imovelId, null);
});

test('valores dos campos ocultos prevalecem sobre o estado interno quando divergem', () => {
    const result = resolveWizardIds({
        hiddenClienteId: 'cliente-do-form',
        hiddenImovelId: 'imovel-do-form',
        stateClienteId: 'cliente-do-estado',
        stateImovelId: 'imovel-do-estado'
    });

    assert.equal(result.clienteId, 'cliente-do-form');
    assert.equal(result.imovelId, 'imovel-do-form');
});

test('resolveWizardId cai para o valor do estado quando o campo oculto é inválido', () => {
    assert.equal(resolveWizardId('', 'cliente-do-estado'), 'cliente-do-estado');
    assert.equal(resolveWizardId('null', 'cliente-do-estado'), 'cliente-do-estado');
    assert.equal(resolveWizardId(undefined, 'cliente-do-estado'), 'cliente-do-estado');
    assert.equal(resolveWizardId('  ', null), null);
});
