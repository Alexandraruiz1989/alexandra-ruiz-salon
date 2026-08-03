import { LegalList, LegalPage, LegalSection, PrivacyContactLink } from "../legal/LegalPage";

export const metadata = {
  title: "Eliminación de datos | Alexandra Ruiz Salón",
  description:
    "Instrucciones para solicitar la eliminación de datos personales asociados con Alexandra Ruiz Salón, incluyendo datos relacionados con Meta y WhatsApp.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Eliminación de datos"
      description="Procedimiento para solicitar la eliminación o revisión de datos personales asociados con Alexandra Ruiz Salón."
    >
      <LegalSection title="1. Cómo solicitar la eliminación">
        <p>
          Puedes solicitar la eliminación de tus datos personales escribiendo al
          contacto de privacidad: <PrivacyContactLink />.
        </p>
        <p>
          Usa como asunto del mensaje:{" "}
          <strong>Solicitud de eliminación de datos</strong>.
        </p>
      </LegalSection>

      <LegalSection title="2. Información necesaria para ubicar tu solicitud">
        <p>
          Para poder localizar tus registros y atender la solicitud, incluye solo
          la información mínima necesaria:
        </p>
        <LegalList
          items={[
            "Nombre con el que solicitaste o recibiste atención.",
            "Teléfono o correo electrónico utilizado para agendar o comunicarte con el salón.",
            "Descripción breve de los datos o canal que deseas revisar o eliminar.",
            "Cualquier referencia de cita o servicio, si la tienes disponible.",
          ]}
        />
        <p>
          No envíes contraseñas, tokens, códigos de acceso, números completos de
          tarjeta bancaria, CVV, claves bancarias ni documentos innecesarios.
        </p>
      </LegalSection>

      <LegalSection title="3. Confirmación y tiempos de atención">
        <p>
          Confirmaremos la recepción de tu solicitud por el mismo canal de
          contacto o por el medio que indiques. Podemos pedir información mínima
          adicional para verificar identidad y evitar que terceros soliciten
          cambios sobre datos que no les pertenecen.
        </p>
        <p>
          La solicitud se atenderá conforme a los plazos previstos por la
          legislación aplicable en materia de protección de datos personales en
          México.
        </p>
      </LegalSection>

      <LegalSection title="4. Información que podría conservarse">
        <p>
          En algunos casos, cierta información puede conservarse durante el
          tiempo necesario para cumplir obligaciones legales, contables,
          fiscales, de seguridad, prevención de fraude, resolución de aclaraciones
          o defensa de derechos.
        </p>
        <p>
          Cuando no sea posible eliminar un dato de inmediato, podremos bloquearlo
          o limitar su uso conforme a la finalidad legal correspondiente.
        </p>
      </LegalSection>

      <LegalSection title="5. Efectos de la eliminación">
        <p>
          La eliminación de datos puede afectar el historial de servicios, citas,
          preferencias, seguimiento, promociones, comprobantes o la posibilidad de
          recuperar información relacionada con atenciones anteriores.
        </p>
      </LegalSection>

      <LegalSection title="6. Eliminación de datos relacionados con Meta y WhatsApp">
        <p>
          Si te comunicaste con Alexandra Ruiz Salón por WhatsApp, Instagram u
          otros servicios relacionados con Meta, puedes solicitar que revisemos y
          eliminemos, cuando proceda, los datos que estén bajo nuestro control
          dentro de nuestros sistemas internos.
        </p>
        <p>
          Esta solicitud no elimina automáticamente información que Meta,
          WhatsApp, Instagram u otros terceros conserven en sus propios sistemas.
          Para ejercer derechos directamente ante esas plataformas, debes revisar
          sus canales y políticas oficiales.
        </p>
      </LegalSection>

      <LegalSection title="7. Contacto">
        <p>
          Para ejercer este derecho o resolver dudas sobre el proceso, escribe a{" "}
          <PrivacyContactLink />.
        </p>
        <p>
          <strong>Última actualización: agosto de 2026.</strong>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
