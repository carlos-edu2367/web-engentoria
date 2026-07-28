const INVALID_LITERALS = new Set(['null', 'undefined']);

export const isValidWizardId = (value) => {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    if (str === '') return false;
    if (INVALID_LITERALS.has(str.toLowerCase())) return false;
    return true;
};

export const normalizeWizardId = (value) => (isValidWizardId(value) ? String(value).trim() : null);

export const resolveWizardId = (hiddenValue, stateValue) => {
    const fromHidden = normalizeWizardId(hiddenValue);
    if (fromHidden !== null) return fromHidden;
    return normalizeWizardId(stateValue);
};

export const resolveWizardIds = ({ hiddenClienteId, hiddenImovelId, stateClienteId, stateImovelId }) => ({
    clienteId: resolveWizardId(hiddenClienteId, stateClienteId),
    imovelId: resolveWizardId(hiddenImovelId, stateImovelId)
});
