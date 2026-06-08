"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
function StarsInput({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-3xl transition ${
            star <= Number(value || 0) ? "text-[#bd7b83]" : "text-[#d8dde0]"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-6 shadow-sm">{children}</div>
  );
}

function getServiceKey(service) {
  return service.id || `${service.service_id}-${service.staff_id}`;
}

export default function PublicReviewPage() {
  const params = useParams();
  const appointmentId = params?.appointmentId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  const [appointment, setAppointment] = useState(null);
const [existingReview, setExistingReview] = useState(null);
  const [salonRating, setSalonRating] = useState(0);
  const [overallComment, setOverallComment] = useState("");
  const [wouldReturn, setWouldReturn] = useState(true);
  const [publicTestimonial, setPublicTestimonial] = useState(false);

  const [staffRatings, setStaffRatings] = useState({});
  const [staffComments, setStaffComments] = useState({});

  const [serviceRatings, setServiceRatings] = useState({});
  const [serviceComments, setServiceComments] = useState({});

  useEffect(() => {
    if (appointmentId) {
      loadAppointment();
    }
  }, [appointmentId]);

 const loadAppointment = async () => {
  setLoading(true);
  setMessage("");

  const { data: reviewData, error: reviewError } = await supabase
    .from("appointment_reviews")
    .select("*")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (reviewError) {
    setMessage(`No pudimos validar si la cita ya fue calificada: ${reviewError.message}`);
    setLoading(false);
    return;
  }

  if (reviewData) {
    setExistingReview(reviewData);
  }

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      clients (
        id,
        full_name,
        phone
      ),
      appointment_services (
        id,
        service_id,
        staff_id,
        start_time,
        end_time,
        services (
          id,
          name,
          category
        ),
        staff (
          id,
          full_name
        )
      )
    `
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    setMessage(`No pudimos cargar tu cita: ${error.message}`);
    setLoading(false);
    return;
  }

  if (!data) {
    setMessage("No encontramos la cita para calificar.");
    setLoading(false);
    return;
  }

  setAppointment(data);
  setLoading(false);
};

  const uniqueStaff = useMemo(() => {
    const result = {};

    (appointment?.appointment_services || []).forEach((item) => {
      if (item.staff?.id) {
        result[item.staff.id] = item.staff;
      }
    });

    return Object.values(result);
  }, [appointment]);

  const services = appointment?.appointment_services || [];

  const handleSaveReview = async () => {
    setSaving(true);
    setMessage("");

    if (!salonRating) {
      setMessage("Por favor califica tu experiencia general en el salón.");
      setSaving(false);
      return;
    }

    const { data: review, error: reviewError } = await supabase
      .from("appointment_reviews")
      .insert([
        {
          appointment_id: appointment.id,
          client_id: appointment.client_id,
          salon_rating: Number(salonRating),
          overall_comment: overallComment.trim() || null,
          would_return: Boolean(wouldReturn),
          public_testimonial: Boolean(publicTestimonial),
        },
      ])
      .select()
      .single();

  if (reviewError) {
  if (
    reviewError.code === "23505" ||
    String(reviewError.message || "").toLowerCase().includes("duplicate")
  ) {
    setExistingReview({
      salon_rating: salonRating,
    });
    setSaving(false);
    return;
  }

  setMessage(`No pudimos guardar tu calificación: ${reviewError.message}`);
  setSaving(false);
  return;
}

    const staffRows = uniqueStaff
      .filter((person) => staffRatings[person.id])
      .map((person) => ({
        review_id: review.id,
        staff_id: person.id,
        rating: Number(staffRatings[person.id]),
        comment: staffComments[person.id]?.trim() || null,
      }));

    if (staffRows.length > 0) {
      const { error } = await supabase
        .from("review_staff_ratings")
        .insert(staffRows);

      if (error) {
        setMessage(
          `Se guardó la calificación general, pero no la calificación de técnica: ${error.message}`
        );
        setSaving(false);
        return;
      }
    }

    const serviceRows = services
      .filter((service) => serviceRatings[getServiceKey(service)])
      .map((service) => ({
        review_id: review.id,
        service_id: service.service_id,
        rating: Number(serviceRatings[getServiceKey(service)]),
        comment: serviceComments[getServiceKey(service)]?.trim() || null,
      }));

    if (serviceRows.length > 0) {
      const { error } = await supabase
        .from("review_service_ratings")
        .insert(serviceRows);

      if (error) {
        setMessage(
          `Se guardó la calificación general, pero no la calificación de servicio: ${error.message}`
        );
        setSaving(false);
        return;
      }
    }

    setSent(true);
    setSaving(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-5 py-10 text-[#263238]">
        <Card>
          <p>Cargando tu cita...</p>
        </Card>
      </main>
    );
  }
if (existingReview) {
  return (
    <main className="min-h-screen bg-[#eef1f3] px-5 py-10 text-[#263238]">
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Gracias
          </p>
          <h1 className="mt-3 text-3xl font-light">
            Esta cita ya fue calificada 💕
          </h1>
          <p className="mt-4 leading-7 text-[#68777c]">
            Muchas gracias por compartir tu opinión con Alexandra Ruiz Salón Spa.
            Tu experiencia nos ayuda a seguir mejorando y a consentirte cada vez mejor.
          </p>

          <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-5">
            <p className="text-sm text-[#68777c]">Calificación registrada:</p>
            <p className="mt-2 text-3xl text-[#bd7b83]">
              {"★".repeat(Number(existingReview.salon_rating || 0))}
              <span className="text-[#dde3e6]">
                {"★".repeat(5 - Number(existingReview.salon_rating || 0))}
              </span>
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
  if (sent) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-5 py-10 text-[#263238]">
        <div className="mx-auto max-w-2xl">
          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Gracias
            </p>
            <h1 className="mt-3 text-3xl font-light">
              Tu calificación fue enviada ✨
            </h1>
            <p className="mt-4 leading-7 text-[#68777c]">
              Muchas gracias por compartir tu experiencia con Alexandra Ruiz
              Salón Spa. Tu opinión nos ayuda muchísimo a seguir mejorando y a
              consentirte cada vez mejor.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  if (!appointment) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-5 py-10 text-[#263238]">
        <div className="mx-auto max-w-2xl">
          <Card>
            <h1 className="text-2xl font-light">No encontramos la cita</h1>
            {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1f3] px-5 py-10 text-[#263238]">
      <div className="mx-auto max-w-3xl">
        <Card>
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Alexandra Ruiz Salón Spa
          </p>

          <h1 className="mt-3 text-3xl font-light">
            ¿Cómo fue tu experiencia?
          </h1>

          <p className="mt-3 leading-7 text-[#68777c]">
            Hola {appointment.clients?.full_name || "hermosa"}, gracias por
            visitarnos. Nos encantaría conocer tu opinión sobre tu cita del{" "}
            {appointment.appointment_date}.
          </p>

          {message && (
            <div className="mt-5 rounded-2xl bg-red-600 px-5 py-4 text-sm font-medium text-white">
              {message}
            </div>
          )}

          <div className="mt-8 rounded-2xl bg-[#f7f9fa] p-5">
            <label className="mb-3 block text-sm font-medium text-[#263238]">
              Calificación general del salón *
            </label>
            <StarsInput value={salonRating} onChange={setSalonRating} />
          </div>

          {uniqueStaff.length > 0 && (
            <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-5">
              <h2 className="text-xl font-light">Califica a quien te atendió</h2>

              <div className="mt-4 space-y-5">
                {uniqueStaff.map((person) => (
                  <div key={person.id} className="rounded-2xl bg-white p-4">
                    <p className="font-medium">{person.full_name}</p>

                    <div className="mt-3">
                      <StarsInput
                        value={staffRatings[person.id] || 0}
                        onChange={(value) =>
                          setStaffRatings((current) => ({
                            ...current,
                            [person.id]: value,
                          }))
                        }
                      />
                    </div>

                    <textarea
                      value={staffComments[person.id] || ""}
                      onChange={(event) =>
                        setStaffComments((current) => ({
                          ...current,
                          [person.id]: event.target.value,
                        }))
                      }
                      className="mt-3 min-h-20 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                      placeholder="Comentario opcional..."
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {services.length > 0 && (
            <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-5">
              <h2 className="text-xl font-light">Califica tus servicios</h2>

              <div className="mt-4 space-y-5">
                {services.map((service) => {
                  const key = getServiceKey(service);

                  return (
                    <div key={key} className="rounded-2xl bg-white p-4">
                      <p className="font-medium">
                        {service.services?.name || "Servicio"}
                      </p>
                      <p className="text-sm text-[#68777c]">
                        {service.staff?.full_name || "Técnica"}
                      </p>

                      <div className="mt-3">
                        <StarsInput
                          value={serviceRatings[key] || 0}
                          onChange={(value) =>
                            setServiceRatings((current) => ({
                              ...current,
                              [key]: value,
                            }))
                          }
                        />
                      </div>

                      <textarea
                        value={serviceComments[key] || ""}
                        onChange={(event) =>
                          setServiceComments((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className="mt-3 min-h-20 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        placeholder="Comentario opcional..."
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-5">
            <label className="mb-2 block text-sm font-medium text-[#263238]">
              Comentario general
            </label>
            <textarea
              value={overallComment}
              onChange={(event) => setOverallComment(event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
              placeholder="Cuéntanos qué te gustó o qué podemos mejorar..."
            />

            <label className="mt-4 flex items-center gap-2 text-sm text-[#68777c]">
              <input
                type="checkbox"
                checked={wouldReturn}
                onChange={(event) => setWouldReturn(event.target.checked)}
              />
              Sí volvería a visitarlas
            </label>

            <label className="mt-3 flex items-center gap-2 text-sm text-[#68777c]">
              <input
                type="checkbox"
                checked={publicTestimonial}
                onChange={(event) =>
                  setPublicTestimonial(event.target.checked)
                }
              />
              Autorizo que mi comentario pueda usarse como testimonio
            </label>
          </div>

          <button
            type="button"
            onClick={handleSaveReview}
            disabled={saving}
            className="mt-6 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Enviando..." : "Enviar calificación"}
          </button>
        </Card>
      </div>
    </main>
  );
}