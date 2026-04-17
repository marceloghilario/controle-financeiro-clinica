# Controle Financeiro · Clínica Multidisciplinar

Aplicação web para controle financeiro de uma clínica multidisciplinar. Permite cadastrar pacientes, planos de saúde, especialidades e preços por convênio, montar o plano semanal de atendimentos de cada paciente, registrar faltas mensais e gerar relatórios consolidados por paciente e por plano de saúde para geração de notas fiscais.

## Regras de negócio

- O **plano semanal** define, por dia da semana (segunda a sexta), quantas sessões de cada especialidade o paciente realiza.
- O cálculo mensal considera somente **dias úteis** (segunda a sexta) do mês de referência: por exemplo, se o paciente faz 2 sessões de psicologia às terças, e o mês tem 5 terças, são 10 sessões previstas.
- As **faltas** são registradas por mês/paciente/especialidade e são **descontadas** das sessões previstas (não são cobradas).
- O **valor por sessão** é definido por (especialidade × plano de saúde), permitindo que convênios diferentes paguem valores diferentes pela mesma especialidade.
- O **total do paciente no mês** = Σ (sessões faturáveis de cada especialidade × valor unitário do plano).
- O relatório por plano consolida todos os pacientes do convênio no mês, para emissão das notas fiscais.

## Stack

- **Backend**: FastAPI + SQLAlchemy 2 + SQLite
- **Frontend**: React + Vite + TypeScript + TailwindCSS
- **Deploy**: backend em Fly.io (volume persistente para SQLite), frontend em devinapps

## Desenvolvimento local

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Por padrão o frontend em dev aponta para `http://localhost:8000`. Em produção, configure a variável `VITE_API_BASE` no build apontando para o backend.

## Estrutura

```
backend/
  app/
    main.py         # rotas FastAPI
    models.py       # modelos SQLAlchemy
    schemas.py      # schemas Pydantic
    billing.py      # cálculo mensal (dias úteis × sessões - faltas)
    database.py     # engine/sessão
frontend/
  src/
    pages/          # telas (Pacientes, Plano semanal, Faltas, Relatórios, ...)
    components/     # componentes de UI reutilizáveis
    api.ts          # cliente HTTP
```
