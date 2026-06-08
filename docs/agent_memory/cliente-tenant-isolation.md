# Isolamento Multi-tenant de Clientes

## Modelo de dados (verificado em `backend/models.py`)
- `Cliente` **não possui FK direta** para `imobiliaria` nem `grupo`. Campos: `nome`, `email`, `telefone1`, `telefone2`, `cpf`, `saldo_devedor_total`, `is_deleted`.
- O vínculo de um cliente com uma imobiliária/grupo é **indireto**, através de `Imovel` (`imovel.cliente_id` + `imovel.imobiliaria_id`) e `Imobiliaria.grupo_id`.
- Clientes são entidades **globais/compartilháveis**: o mesmo cliente pode ter imóveis em imobiliárias de grupos diferentes.

## Padrão de isolamento já existente (verificado)
Em `backend/routes/agendamento_externo_routes.py` (`get_clientes_agendamento`, ~linha 56):
```python
query = db.query(models.Cliente).filter(models.Cliente.is_deleted == False)
if isinstance(current_user, models.GrupoImobiliaria):
    query = query.join(models.Imovel).join(models.Imobiliaria).filter(
        models.Imobiliaria.grupo_id == current_user.id,
        models.Imovel.is_deleted == False
    ).distinct()
```
Este é o padrão canônico para "clientes do grupo". Reutilizado na feature de edição.

## Observação / dívida pré-existente (NÃO alterada nesta tarefa)
`GET /imobiliaria/clientes` em `backend/routes/imobiliaria_routes.py` (~linha 1237) faz busca **GLOBAL** de clientes (sem filtro por grupo), usada no autocomplete de agendamento. É um vazamento de listagem entre tenants, porém é comportamento legado e fora do escopo desta tarefa. A edição usa endpoint próprio com isolamento.

## Auth
- `auth.get_current_active_imobiliaria_group` garante que `current_user` é `models.GrupoImobiliaria`.
- O router de `imobiliaria_routes.py` já aplica essa dependency globalmente.
