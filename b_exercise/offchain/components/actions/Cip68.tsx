import { useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/modal";

import { Action } from "@/types/action";

export default function Cip68(props: { onMint: Action; onUpdate: Action; onBurn: Action }) {
  const { onMint, onUpdate, onBurn } = props;

  function MintButton() {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    const [name, setTokenName] = useState("");
    const [image, setTokenImageURL] = useState("");

    return (
      <>
        <Button className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full" onPress={onOpen}>
          Mint
        </Button>

        <Modal isOpen={isOpen} placement="top-center" onOpenChange={onOpenChange}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">Mint</ModalHeader>
                <ModalBody>
                  <Input label="Name" placeholder="Enter token name" variant="bordered" onValueChange={setTokenName} />
                  <Input label="Image URL" placeholder="Enter token image URL" variant="bordered" onValueChange={setTokenImageURL} />
                </ModalBody>
                <ModalFooter>
                  <Button
                    className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                    radius="full"
                    onPress={() => onMint({ name, image }).then(onClose)}
                  >
                    Submit
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </>
    );
  }

  function UpdateButton() {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    const [name, setTokenName] = useState("");
    const [image, setTokenImageURL] = useState("");

    return (
      <>
        <Button className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full" onPress={onOpen}>
          Update
        </Button>

        <Modal isOpen={isOpen} placement="top-center" onOpenChange={onOpenChange}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">Update</ModalHeader>
                <ModalBody>
                  <Input label="Name" placeholder="Enter token name" variant="bordered" onValueChange={setTokenName} />
                  <Input label="Image URL" placeholder="Enter token image URL" variant="bordered" onValueChange={setTokenImageURL} />
                </ModalBody>
                <ModalFooter>
                  <Button
                    className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                    radius="full"
                    onPress={() => onUpdate({ name, image }).then(onClose)}
                  >
                    Submit
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      <MintButton />
      <UpdateButton />
      <Button className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full" onPress={onBurn}>
        Burn
      </Button>
    </div>
  );
}
