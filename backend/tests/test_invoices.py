"""Tests for the invoice (nota fiscal) API endpoints.

Validates:
1. Normal invoice creation flow still works
2. Duplicate number is rejected (existing behavior preserved)
3. Copy flow works: create invoice, then POST a copy with different number
4. Copy preserves all fields except number
5. Original invoice is not modified after copy
6. Existing invoices are not affected by new operations
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

INVOICE_PAYLOAD = {
    "number": "NF-001",
    "issue_date": "2026-06-01",
    "patient_id": None,
    "patient_name": "Maria Silva",
    "reference_year": 2026,
    "reference_month": 6,
    "health_plan_name": "Unimed",
    "gross_value": 5000.0,
    "net_value": 4692.50,
    "taxes": 307.50,
    "notes": "Consulta mensal",
    "status": "em_aberto",
}


@pytest.mark.anyio
async def test_create_invoice(auth_headers):
    """Normal invoice creation should succeed."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["number"] == "NF-001"
    assert body["patient_name"] == "Maria Silva"
    assert body["gross_value"] == 5000.0
    assert body["net_value"] == 4692.50
    assert body["taxes"] == 307.50
    assert body["health_plan_name"] == "Unimed"
    assert body["reference_year"] == 2026
    assert body["reference_month"] == 6
    assert body["notes"] == "Consulta mensal"
    assert body["status"] == "em_aberto"
    assert "id" in body


@pytest.mark.anyio
async def test_duplicate_number_rejected(auth_headers):
    """Creating two invoices with the same number should fail with 409."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp1 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        assert resp1.status_code == 201

        resp2 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        assert resp2.status_code == 409
        assert "Já existe" in resp2.json()["detail"]


@pytest.mark.anyio
async def test_copy_invoice_flow(auth_headers):
    """Simulates the copy flow: create original, then create copy with new number.

    The copy must have:
    - Different number
    - Same patient, plan, values, notes, dates, status
    - Its own unique ID
    """
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # Create original
        resp1 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        assert resp1.status_code == 201
        original = resp1.json()

        # Create copy (same data, different number)
        copy_payload = {**INVOICE_PAYLOAD, "number": "NF-002"}
        resp2 = await ac.post(
            "/api/invoices", json=copy_payload, headers=auth_headers
        )
        assert resp2.status_code == 201
        copy = resp2.json()

        # Copy has different ID and number
        assert copy["id"] != original["id"]
        assert copy["number"] == "NF-002"

        # All other fields match the original
        for field in [
            "patient_name",
            "reference_year",
            "reference_month",
            "health_plan_name",
            "gross_value",
            "net_value",
            "taxes",
            "notes",
            "status",
        ]:
            assert copy[field] == original[field], f"Field '{field}' mismatch"


@pytest.mark.anyio
async def test_original_not_modified_after_copy(auth_headers):
    """After creating a copy, the original invoice must remain unchanged."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # Create original
        resp1 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        original = resp1.json()
        original_id = original["id"]

        # Create copy
        copy_payload = {**INVOICE_PAYLOAD, "number": "NF-002"}
        await ac.post(
            "/api/invoices", json=copy_payload, headers=auth_headers
        )

        # Fetch original again and verify it hasn't changed
        resp_list = await ac.get("/api/invoices", headers=auth_headers)
        assert resp_list.status_code == 200
        invoices = resp_list.json()
        refetched = next(inv for inv in invoices if inv["id"] == original_id)

        for field in [
            "number",
            "patient_name",
            "reference_year",
            "reference_month",
            "health_plan_name",
            "gross_value",
            "net_value",
            "taxes",
            "notes",
            "status",
        ]:
            assert refetched[field] == original[field], (
                f"Original field '{field}' was modified!"
            )


@pytest.mark.anyio
async def test_copy_with_same_number_fails(auth_headers):
    """Copy must use a different number — same number should be rejected."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp1 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        assert resp1.status_code == 201

        # Try to copy with same number
        resp2 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        assert resp2.status_code == 409


@pytest.mark.anyio
async def test_existing_invoices_not_affected(auth_headers):
    """Creating new invoices should not affect pre-existing ones."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # Create 3 invoices
        invoices_data = []
        for i in range(1, 4):
            payload = {**INVOICE_PAYLOAD, "number": f"NF-{i:03d}"}
            resp = await ac.post(
                "/api/invoices", json=payload, headers=auth_headers
            )
            assert resp.status_code == 201
            invoices_data.append(resp.json())

        # Verify all 3 exist and are correct
        resp_list = await ac.get("/api/invoices", headers=auth_headers)
        all_invoices = resp_list.json()
        assert len(all_invoices) == 3

        for original in invoices_data:
            found = next(
                inv for inv in all_invoices if inv["id"] == original["id"]
            )
            assert found["number"] == original["number"]
            assert found["patient_name"] == original["patient_name"]
            assert found["gross_value"] == original["gross_value"]


@pytest.mark.anyio
async def test_edit_existing_invoice(auth_headers):
    """Editing an existing invoice still works correctly (no regression)."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp1 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        inv = resp1.json()

        # Update the notes
        resp2 = await ac.put(
            f"/api/invoices/{inv['id']}",
            json={"notes": "Nota atualizada"},
            headers=auth_headers,
        )
        assert resp2.status_code == 200
        updated = resp2.json()
        assert updated["notes"] == "Nota atualizada"
        assert updated["number"] == "NF-001"  # number unchanged


@pytest.mark.anyio
async def test_delete_invoice(auth_headers):
    """Deleting an invoice still works correctly (no regression)."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp1 = await ac.post(
            "/api/invoices", json=INVOICE_PAYLOAD, headers=auth_headers
        )
        inv = resp1.json()

        resp2 = await ac.delete(
            f"/api/invoices/{inv['id']}", headers=auth_headers
        )
        assert resp2.status_code == 204

        resp3 = await ac.get("/api/invoices", headers=auth_headers)
        assert len(resp3.json()) == 0
