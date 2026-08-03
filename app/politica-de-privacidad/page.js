import { LegalList, LegalPage, LegalSection, PrivacyContactLink } from "../legal/LegalPage";

export const metadata = {
  title: "Política de privacidad | Alexandra Ruiz Salón",
  description:
    "Consulta cómo Alexandra Ruiz Salón recopila, utiliza, protege y conserva los datos personales relacionados con sus servicios, citas y comunicación.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      description="Información clara sobre el tratamiento de datos personales de clientas y usuarios que interactúan con Alexandra Ruiz Salón."
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          Alexandra Ruiz Salón, ubicado en Mérida, Yucatán, México, es responsable
          del tratamiento de los datos personales que se recopilan a través de este
          sitio web, canales digitales, formularios de contacto, herramientas de
          agenda, WhatsApp, redes sociales y atención directa en el salón.
        </p>
        <p>
          Sitio oficial:{" "}
          <a className="text-[#bd7b83] underline-offset-4 hover:underline" href="https://www.alexandraruizsalon.com">
            www.alexandraruizsalon.com
          </a>
          . Instagram: @Alexandraruizsalon.
        </p>
      </LegalSection>

      <LegalSection title="2. Contacto para privacidad">
        <p>
          Para dudas, solicitudes ARCO, revocación de consentimiento o eliminación
          de datos, escribe a: <PrivacyContactLink />.
        </p>
      </LegalSection>

      <LegalSection title="3. Datos personales que podemos recopilar">
        <p>
          Podemos recopilar datos necesarios para brindar atención, administrar
          citas y mantener comunicación relacionada con nuestros servicios.
        </p>
        <LegalList
          items={[
            "Nombre y datos de contacto, como teléfono, correo electrónico o usuario de redes sociales.",
            "Información de citas, servicios solicitados, historial de atención, preferencias, notas de seguimiento y observaciones necesarias para prestar el servicio.",
            "Comunicaciones enviadas por formularios, WhatsApp, redes sociales, correo electrónico o mensajes dentro del sistema.",
            "Datos técnicos básicos del uso del sitio, como navegador, dispositivo, fecha, hora y dirección IP aproximada cuando sea necesario para seguridad y funcionamiento.",
            "Comprobantes o referencias de pago cuando la clienta los proporcione para confirmar una reservación o anticipo.",
          ]}
        />
        <p>
          No solicitamos ni almacenamos números completos de tarjeta bancaria,
          CVV, contraseñas bancarias ni datos financieros sensibles completos.
        </p>
      </LegalSection>

      <LegalSection title="4. Finalidades del tratamiento">
        <LegalList
          items={[
            "Registrar, confirmar, modificar o cancelar citas.",
            "Dar seguimiento a servicios, preferencias, historial de atención y solicitudes de las clientas.",
            "Enviar recordatorios, confirmaciones, avisos operativos y mensajes relacionados con la cita.",
            "Atender dudas, solicitudes, quejas, aclaraciones o seguimiento posterior al servicio.",
            "Administrar pagos, anticipos, comprobantes y registros internos necesarios para la operación.",
            "Mejorar la calidad del servicio, la experiencia del sitio y la seguridad de nuestros sistemas.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Promociones y comunicaciones comerciales">
        <p>
          Podemos enviar promociones, novedades o beneficios únicamente cuando
          exista autorización, relación previa o una base legal aplicable. La
          clienta puede solicitar dejar de recibir mensajes promocionales en
          cualquier momento escribiendo al contacto de privacidad o respondiendo
          por el canal donde recibió la comunicación.
        </p>
        <p>
          Los mensajes operativos relacionados con citas, confirmaciones,
          cambios, pagos o atención solicitada no se consideran publicidad.
        </p>
      </LegalSection>

      <LegalSection title="6. Proveedores y terceros">
        <p>
          Para operar el sitio y la atención digital podemos apoyarnos en
          proveedores tecnológicos que tratan datos únicamente para prestar sus
          servicios, por ejemplo:
        </p>
        <LegalList
          items={[
            "Servicios de hospedaje, base de datos, almacenamiento, seguridad y despliegue del sitio.",
            "Herramientas de comunicación como WhatsApp y servicios relacionados con Meta, cuando la clienta utiliza esos canales.",
            "Servicios de correo electrónico, formularios, analítica técnica o soporte operativo cuando sean necesarios.",
          ]}
        />
        <p>
          No vendemos datos personales. Solo compartimos información cuando es
          necesario para prestar el servicio, cumplir obligaciones legales,
          proteger derechos o atender una solicitud de la clienta.
        </p>
      </LegalSection>

      <LegalSection title="7. Conservación de datos">
        <p>
          Conservamos los datos durante el tiempo necesario para cumplir las
          finalidades descritas, atender solicitudes, mantener historial de
          servicios, cumplir obligaciones administrativas, contables o legales y
          proteger la seguridad del sistema.
        </p>
        <p>
          Cuando los datos dejen de ser necesarios, podrán eliminarse, bloquearse
          o anonimizarse conforme a los procedimientos internos y la legislación
          aplicable.
        </p>
      </LegalSection>

      <LegalSection title="8. Seguridad">
        <p>
          Aplicamos medidas razonables de seguridad administrativas, técnicas y
          organizativas para proteger la información contra acceso no autorizado,
          pérdida, alteración, divulgación o uso indebido. Ningún sistema es
          absolutamente infalible, pero trabajamos para mantener controles
          proporcionales al tipo de información tratada.
        </p>
      </LegalSection>

      <LegalSection title="9. Derechos ARCO, revocación y eliminación">
        <p>
          La persona titular puede solicitar acceso, rectificación, cancelación u
          oposición al tratamiento de sus datos personales, así como revocar su
          consentimiento o pedir la eliminación de información cuando proceda.
          Para iniciar una solicitud, escribe a <PrivacyContactLink />.
        </p>
        <p>
          Podemos solicitar información mínima para verificar identidad y ubicar
          los registros correspondientes. No pediremos contraseñas, códigos de
          acceso, tokens ni datos bancarios sensibles.
        </p>
      </LegalSection>

      <LegalSection title="10. Menores de edad">
        <p>
          Si una persona menor de edad solicita servicios o atención, el
          tratamiento de sus datos deberá realizarse con autorización o
          acompañamiento de su madre, padre, tutor o representante legal cuando
          corresponda.
        </p>
      </LegalSection>

      <LegalSection title="11. Cambios a esta política">
        <p>
          Esta política puede actualizarse para reflejar cambios operativos,
          tecnológicos, legales o de servicio. La versión vigente estará
          disponible en este sitio web.
        </p>
        <p>
          <strong>Última actualización: agosto de 2026.</strong>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
