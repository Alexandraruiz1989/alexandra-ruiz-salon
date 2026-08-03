import { LegalList, LegalPage, LegalSection, PrivacyContactLink } from "../legal/LegalPage";

export const metadata = {
  title: "Términos y condiciones | Alexandra Ruiz Salón",
  description:
    "Consulta las condiciones generales de uso del sitio, solicitud de citas y comunicación digital de Alexandra Ruiz Salón.",
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPage
      title="Términos y condiciones"
      description="Condiciones generales para utilizar el sitio web, consultar servicios y solicitar atención o citas con Alexandra Ruiz Salón."
    >
      <LegalSection title="1. Uso del sitio">
        <p>
          Al navegar este sitio o utilizar nuestros formularios, enlaces de
          contacto, herramientas de agenda o canales digitales, aceptas utilizar
          la información de manera lícita, respetuosa y conforme a estos términos.
        </p>
        <p>
          Este sitio tiene fines informativos, de contacto y apoyo para la
          organización de servicios de belleza ofrecidos por Alexandra Ruiz Salón
          en Mérida, Yucatán, México.
        </p>
      </LegalSection>

      <LegalSection title="2. Información de citas y disponibilidad">
        <p>
          La disponibilidad de horarios, profesionales y servicios puede variar.
          Una solicitud de cita no se considera definitivamente confirmada hasta
          que el salón la confirme por el canal correspondiente o mediante el
          sistema de reservación aplicable.
        </p>
        <p>
          La duración estimada de los servicios puede cambiar según valoración,
          condiciones del servicio, diseño solicitado, retiro previo, estado de la
          uña o cabello, técnica requerida y otros factores propios de la atención.
        </p>
      </LegalSection>

      <LegalSection title="3. Precios, valoración y servicios">
        <p>
          Los precios publicados o comunicados pueden ser referencias generales.
          Algunos servicios requieren valoración previa o cotización personalizada.
          El precio final, duración, materiales o adicionales se confirmarán
          conforme a la información disponible y las necesidades del servicio.
        </p>
        <p>
          Las imágenes, ejemplos o descripciones son ilustrativas y no garantizan
          un resultado idéntico, ya que cada servicio depende de condiciones
          personales, diseño, mantenimiento y cuidados posteriores.
        </p>
      </LegalSection>

      <LegalSection title="4. Anticipos, pagos y políticas de reservación">
        <p>
          Cuando aplique un anticipo, condición de pago, política de cancelación,
          reagenda o penalización por inasistencia, esta será comunicada a la
          clienta durante el proceso de reservación o por el canal de atención
          correspondiente.
        </p>
        <p>
          No inventamos ni asumimos políticas no comunicadas. Las condiciones
          específicas vigentes serán las informadas al momento de reservar o
          confirmar la cita.
        </p>
      </LegalSection>

      <LegalSection title="5. Cancelaciones, cambios y no asistencia">
        <p>
          Las solicitudes de cancelación, cambio de horario, reagenda o cualquier
          situación de no asistencia se atenderán conforme a la política que se
          comunique a la clienta al momento de reservar o confirmar su cita.
        </p>
        <p>
          Recomendamos avisar con la mayor anticipación posible para facilitar la
          organización del salón y la disponibilidad para otras clientas.
        </p>
      </LegalSection>

      <LegalSection title="6. Información proporcionada por la clienta">
        <p>
          La clienta se compromete a proporcionar información correcta y
          actualizada, incluyendo nombre, teléfono, correo, servicio solicitado,
          fecha, hora, referencias de diseño y cualquier dato necesario para
          brindar una atención adecuada.
        </p>
        <p>
          Alexandra Ruiz Salón no será responsable por errores de reservación o
          comunicación derivados de información incorrecta, incompleta o no
          actualizada proporcionada por la clienta.
        </p>
      </LegalSection>

      <LegalSection title="7. Uso aceptable">
        <LegalList
          items={[
            "No utilizar el sitio o canales digitales para enviar mensajes ofensivos, falsos, fraudulentos o contrarios a la ley.",
            "No intentar vulnerar, interferir o acceder sin autorización a sistemas, cuentas, formularios o datos.",
            "No suplantar a otra persona ni proporcionar información engañosa.",
            "No utilizar contenidos del sitio para fines comerciales no autorizados.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Propiedad intelectual">
        <p>
          Los textos, imágenes, marcas, logotipos, diseños, fotografías y demás
          contenidos del sitio pertenecen a Alexandra Ruiz Salón o a sus
          respectivos titulares. Su uso, reproducción o distribución requiere
          autorización previa, salvo cuando la ley permita lo contrario.
        </p>
      </LegalSection>

      <LegalSection title="9. Servicios de terceros">
        <p>
          El sitio puede incluir enlaces, mapas, herramientas de mensajería,
          redes sociales, proveedores tecnológicos o servicios de terceros. El uso
          de esas plataformas puede estar sujeto a sus propios términos y
          políticas de privacidad.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitación razonable de responsabilidad">
        <p>
          Alexandra Ruiz Salón procura mantener información clara y actualizada,
          pero no garantiza que el sitio esté libre de interrupciones, errores
          técnicos o cambios de disponibilidad. En la medida permitida por la ley,
          la responsabilidad se limita a la atención directa del servicio
          contratado o solicitado.
        </p>
      </LegalSection>

      <LegalSection title="11. Legislación y jurisdicción">
        <p>
          Estos términos se rigen por las leyes aplicables en México. Para la
          interpretación o cumplimiento de estos términos, las partes se someten a
          la jurisdicción competente en el estado de Yucatán, México, salvo que
          una disposición legal aplicable indique otra cosa.
        </p>
      </LegalSection>

      <LegalSection title="12. Contacto">
        <p>
          Para dudas sobre estos términos, puedes escribir a{" "}
          <PrivacyContactLink />.
        </p>
        <p>
          <strong>Última actualización: agosto de 2026.</strong>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
