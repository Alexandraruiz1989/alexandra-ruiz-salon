"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const menuItems = [
  { key: "resumen", label: "Resumen" },
  { key: "comentarios", label: "Comentarios" },
  { key: "tecnicas", label: "Por técnica" },
  { key: "servicios", label: "Por servicio" },
];

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-light">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[#68777c]">{description}</p>
      )}
    </div>
  );
}

function Stars({ rating }) {
  const value = Number(rating || 0);

  return (
    <span className="text-[#bd7b83]">
      {"★".repeat(value)}
      <span className="text-[#dde3e6]">{"★".repeat(5 - value)}</span>
    </span>
  );
}

function getAverage(items, field = "rating") {
  if (!items.length) return 0;

  const total = items.reduce((sum, item) => sum + Number(item[field] || 0), 0);
  return (total / items.length).toFixed(1);
}

export default function CalificacionesPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeSection, setActiveSection] = useState("resumen");
  const [message, setMessage] = useState("");

  const [reviews, setReviews] = useState([]);
  const [staffRatings, setStaffRatings] = useState([]);
  const [serviceRatings, setServiceRatings] = useState([]);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadData();
    };

    start();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [reviewsResult, staffResult, servicesResult] = await Promise.all([
      supabase
        .from("appointment_reviews")
        .select(
          `
          *,
          clients (
            full_name,
            phone
          ),
          appointments (
            appointment_date,
            start_time
          )
        `
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("review_staff_ratings")
        .select(
          `
          *,
          staff (
            full_name
          ),
          appointment_reviews (
            id,
            created_at,
            clients (
              full_name
            )
          )
        `
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("review_service_ratings")
        .select(
          `
          *,
          services (
            name,
            category
          ),
          appointment_reviews (
            id,
            created_at,
            clients (
              full_name
            )
          )
        `
        )
        .order("created_at", { ascending: false }),
    ]);

    if (reviewsResult.error) {
      setMessage(`No se pudieron cargar calificaciones: ${reviewsResult.error.message}`);
    } else {
      setReviews(reviewsResult.data || []);
    }

    if (staffResult.error) {
      setMessage(`No se pudieron cargar calificaciones por técnica: ${staffResult.error.message}`);
    } else {
      setStaffRatings(staffResult.data || []);
    }

    if (servicesResult.error) {
      setMessage(`No se pudieron cargar calificaciones por servicio: ${servicesResult.error.message}`);
    } else {
      setServiceRatings(servicesResult.data || []);
    }

    setLoadingData(false);
  };

  const lowReviews = useMemo(() => {
    return reviews.filter((review) => Number(review.salon_rating || 0) <= 3);
  }, [reviews]);

  const staffSummary = useMemo(() => {
    const result = {};

    staffRatings.forEach((item) => {
      const name = item.staff?.full_name || "Sin técnica";

      if (!result[name]) {
        result[name] = {
          name,
          count: 0,
          total: 0,
          comments: [],
        };
      }

      result[name].count += 1;
      result[name].total += Number(item.rating || 0);

      if (item.comment) {
        result[name].comments.push(item.comment);
      }
    });

    return Object.values(result).map((item) => ({
      ...item,
      average: item.count > 0 ? (item.total / item.count).toFixed(1) : 0,
    }));
  }, [staffRatings]);

  const serviceSummary = useMemo(() => {
    const result = {};

    serviceRatings.forEach((item) => {
      const name = item.services?.name || "Sin servicio";
      const category = item.services?.category || "";

      if (!result[name]) {
        result[name] = {
          name,
          category,
          count: 0,
          total: 0,
          comments: [],
        };
      }

      result[name].count += 1;
      result[name].total += Number(item.rating || 0);

      if (item.comment) {
        result[name].comments.push(item.comment);
      }
    });

    return Object.values(result).map((item) => ({
      ...item,
      average: item.count > 0 ? (item.total / item.count).toFixed(1) : 0,
    }));
  }, [serviceRatings]);

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Calificaciones"
      subtitle="Consulta la experiencia de las clientas, calificaciones por técnica y por servicio."
      activeModule="calificaciones"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div className="mb-6 rounded-2xl bg-red-600 px-5 py-4 text-sm font-medium text-white">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Calificaciones
          </p>
          <p className="mt-3 text-4xl font-light">{reviews.length}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Promedio salón
          </p>
          <p className="mt-3 text-4xl font-light">
            {getAverage(reviews, "salon_rating")}
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Alertas bajas
          </p>
          <p className="mt-3 text-4xl font-light">{lowReviews.length}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Testimonios públicos
          </p>
          <p className="mt-3 text-4xl font-light">
            {reviews.filter((review) => review.public_testimonial).length}
          </p>
        </Card>
      </div>

      {activeSection === "resumen" && (
        <Card>
          <SectionHeader
            eyebrow="Resumen"
            title="Vista general de satisfacción"
            description="Aquí verás el estado general de experiencia de clientas."
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando...</p>
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay calificaciones registradas.
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.slice(0, 8).map((review) => (
                <div
                  key={review.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row">
                    <div>
                      <p className="font-medium text-[#263238]">
                        {review.clients?.full_name || "Clienta"}
                      </p>
                      <p className="mt-1 text-sm text-[#68777c]">
                        {review.appointments?.appointment_date || ""}
                      </p>
                    </div>

                    <div className="text-sm">
                      <Stars rating={review.salon_rating} />{" "}
                      <span className="text-[#68777c]">
                        {review.salon_rating || 0}/5
                      </span>
                    </div>
                  </div>

                  {review.overall_comment && (
                    <p className="mt-4 rounded-xl bg-[#f7f9fa] p-4 text-sm leading-6 text-[#68777c]">
                      {review.overall_comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "comentarios" && (
        <Card>
          <SectionHeader
            eyebrow="Comentarios"
            title="Opiniones recientes"
            description="Comentarios generales de clientas y alertas de experiencia."
          />

          <div className="space-y-4">
            {reviews.filter((review) => review.overall_comment).length === 0 ? (
              <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                Aún no hay comentarios registrados.
              </div>
            ) : (
              reviews
                .filter((review) => review.overall_comment)
                .map((review) => (
                  <div
                    key={review.id}
                    className={`rounded-2xl border p-5 ${
                      Number(review.salon_rating || 0) <= 3
                        ? "border-red-200 bg-red-50"
                        : "border-[#dde3e6] bg-[#fdfefe]"
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row">
                      <div>
                        <p className="font-medium text-[#263238]">
                          {review.clients?.full_name || "Clienta"}
                        </p>
                        <p className="mt-1 text-sm text-[#68777c]">
                          {new Date(review.created_at).toLocaleDateString("es-MX")}
                        </p>
                      </div>

                      <div className="text-sm">
                        <Stars rating={review.salon_rating} />{" "}
                        <span className="text-[#68777c]">
                          {review.salon_rating || 0}/5
                        </span>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-[#68777c]">
                      {review.overall_comment}
                    </p>
                  </div>
                ))
            )}
          </div>
        </Card>
      )}

      {activeSection === "tecnicas" && (
        <Card>
          <SectionHeader
            eyebrow="Por técnica"
            title="Calificaciones del personal"
            description="Promedio y comentarios por colaboradora."
          />

          <div className="grid gap-4 xl:grid-cols-2">
            {staffSummary.length === 0 ? (
              <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                Aún no hay calificaciones por técnica.
              </div>
            ) : (
              staffSummary.map((item) => (
                <div
                  key={item.name}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <p className="text-xl font-light">{item.name}</p>
                  <p className="mt-2 text-sm text-[#68777c]">
                    Promedio: {item.average}/5 · {item.count} calificación(es)
                  </p>
                  <div className="mt-2">
                    <Stars rating={Math.round(item.average)} />
                  </div>

                  {item.comments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {item.comments.slice(0, 3).map((comment, index) => (
                        <p
                          key={index}
                          className="rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]"
                        >
                          {comment}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {activeSection === "servicios" && (
        <Card>
          <SectionHeader
            eyebrow="Por servicio"
            title="Calificaciones de servicios"
            description="Promedio y comentarios por servicio realizado."
          />

          <div className="grid gap-4 xl:grid-cols-2">
            {serviceSummary.length === 0 ? (
              <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                Aún no hay calificaciones por servicio.
              </div>
            ) : (
              serviceSummary.map((item) => (
                <div
                  key={item.name}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <p className="text-xl font-light">{item.name}</p>
                  <p className="mt-1 text-sm text-[#68777c]">{item.category}</p>
                  <p className="mt-2 text-sm text-[#68777c]">
                    Promedio: {item.average}/5 · {item.count} calificación(es)
                  </p>
                  <div className="mt-2">
                    <Stars rating={Math.round(item.average)} />
                  </div>

                  {item.comments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {item.comments.slice(0, 3).map((comment, index) => (
                        <p
                          key={index}
                          className="rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]"
                        >
                          {comment}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </AdminShell>
  );
}